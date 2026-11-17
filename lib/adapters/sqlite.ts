import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Journey } from '@/lib/domain/contracts';
import { ApplicationError } from '@/lib/domain/errors';
import type {
  JourneyRepository,
  SessionRepository,
  LimitPort,
  AuthRepository,
} from '@/lib/application/ports';
const globalDb = globalThis as unknown as { tourpassDb?: DatabaseSync };
export function db() {
  if (!globalDb.tourpassDb) {
    const path = resolve(
      /* turbopackIgnore: true */ process.env.DATABASE_PATH ||
        '.runtime/tourpass.sqlite',
    );
    mkdirSync(dirname(path), { recursive: true });
    const connection = new DatabaseSync(path);
    connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS journeys (id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS journeys_owner ON journeys(owner);
      CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, owner TEXT NOT NULL, journey TEXT NOT NULL, place TEXT NOT NULL, image BLOB NOT NULL, UNIQUE(journey,place));
      CREATE TABLE IF NOT EXISTS account_sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, session TEXT NOT NULL, expires INTEGER NOT NULL);`);
    globalDb.tourpassDb = connection;
  }
  return globalDb.tourpassDb;
}
// SQLite transactions must finish synchronously before releasing the write lock.
export function transaction<T>(operation: (connection: DatabaseSync) => T): T {
  const connection = db();
  connection.exec('BEGIN IMMEDIATE');
  try {
    const result = operation(connection);
    connection.exec('COMMIT');
    return result;
  } catch (error) {
    connection.exec('ROLLBACK');
    throw error;
  }
}

export const journeyRepository: JourneyRepository = {
  list(owner) {
    return (
      db()
        .prepare('SELECT data FROM journeys WHERE owner=? ORDER BY rowid DESC')
        .all(owner) as { data: string }[]
    ).map((row) => JSON.parse(row.data));
  },
  find(owner, id) {
    const row = db()
      .prepare('SELECT data FROM journeys WHERE id=? AND owner=?')
      .get(id, owner) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Journey) : undefined;
  },
  insert(owner, journey) {
    db()
      .prepare('INSERT INTO journeys VALUES (?, ?, ?)')
      .run(journey.id, owner, JSON.stringify(journey));
  },
  update(owner, journey) {
    db()
      .prepare('UPDATE journeys SET data=? WHERE id=? AND owner=?')
      .run(JSON.stringify(journey), journey.id, owner);
  },
  photo(owner, journey, place) {
    return db()
      .prepare(
        'SELECT id,image FROM photos WHERE owner=? AND journey=? AND place=?',
      )
      .get(owner, journey, place) as
      | { id: string; image: Uint8Array }
      | undefined;
  },
  photoPlaces(owner, journey) {
    return (
      db()
        .prepare('SELECT place FROM photos WHERE journey=? AND owner=?')
        .all(journey, owner) as { place: string }[]
    ).map((row) => row.place);
  },
  putPhoto(owner, journey, place, photo) {
    db()
      .prepare(
        'INSERT INTO photos VALUES (?,?,?,?,?) ON CONFLICT(journey,place) DO UPDATE SET image=excluded.image,id=excluded.id',
      )
      .run(photo.id, owner, journey, place, photo.image);
  },
  transaction: (operation) => transaction(operation),
};
export const sessionRepository: SessionRepository = {
  owner(hash, now) {
    return (
      db()
        .prepare(
          'SELECT COALESCE(a.owner,s.token) AS owner FROM sessions s LEFT JOIN account_sessions a ON a.token=s.token WHERE s.token=? AND s.expires>?',
        )
        .get(hash, now) as { owner: string } | undefined
    )?.owner;
  },
  insert(owner, expires) {
    db().prepare('INSERT INTO sessions VALUES (?,?)').run(owner, expires);
  },
};
export const authRepository: AuthRepository = {
  attempt(state, session, expires) {
    transaction((connection) => {
      connection
        .prepare('DELETE FROM oauth_states WHERE expires<=? OR session=?')
        .run(Date.now(), session);
      connection
        .prepare('INSERT INTO oauth_states VALUES (?,?,?)')
        .run(state, session, expires);
    });
  },
  consume(state, session, now) {
    return Boolean(
      db()
        .prepare(
          'DELETE FROM oauth_states WHERE state=? AND session=? AND expires>? RETURNING state',
        )
        .get(state, session, now),
    );
  },
  login(previous, next, owner, now) {
    transaction((connection) => {
      const current = sessionRepository.owner(previous, now);
      if (!current)
        throw new ApplicationError(
          'SESSION_REQUIRED',
          '로그인 세션이 만료되었습니다. 다시 시도해 주세요.',
        );
      if (current === previous) {
        connection
          .prepare('UPDATE journeys SET owner=? WHERE owner=?')
          .run(owner, previous);
        connection
          .prepare('UPDATE photos SET owner=? WHERE owner=?')
          .run(owner, previous);
      }
      authRepository.revoke(previous);
      sessionRepository.insert(next, now + 30 * 86400000);
      connection
        .prepare('INSERT INTO account_sessions VALUES (?,?)')
        .run(next, owner);
    });
  },
  revoke(hash) {
    db().prepare('DELETE FROM sessions WHERE token=?').run(hash);
    db().prepare('DELETE FROM account_sessions WHERE token=?').run(hash);
    db().prepare('DELETE FROM oauth_states WHERE session=?').run(hash);
  },
};
export const limits: LimitPort = { consume: consumeLimit };
export function consumeLimit(key: string, maximum: number) {
  const bucket = `${key}:${Math.floor(Date.now() / 3600000)}`;
  const row = db()
    .prepare(
      'INSERT INTO limits VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
    .get(bucket) as { count: number };
  return row.count <= maximum;
}
