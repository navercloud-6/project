import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { Journey } from '@/lib/domain/contracts';
import { ApplicationError } from '@/lib/domain/errors';
import type {
  JourneyRepository,
  SessionRepository,
  LimitPort,
  AuthRepository,
} from '@/lib/application/ports';

type StoredPool = {
  connectionString: string;
  sslMode: string;
  pool: Pool;
  initialized?: Promise<void>;
  lastLimitPruneHour?: number;
};

const globalPg = globalThis as unknown as {
  tourpassPg?: StoredPool;
  tourpassPgTx?: AsyncLocalStorage<PoolClient>;
};
const txStorage = (globalPg.tourpassPgTx ??=
  new AsyncLocalStorage<PoolClient>());

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    expires BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS journeys (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    data JSONB NOT NULL,
    seq BIGSERIAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS journeys_owner_seq ON journeys (owner, seq DESC);
  CREATE TABLE IF NOT EXISTS limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    journey TEXT NOT NULL,
    place TEXT NOT NULL,
    image BYTEA NOT NULL,
    UNIQUE (journey, place)
  );
  CREATE INDEX IF NOT EXISTS photos_owner_journey ON photos (owner, journey);
  CREATE TABLE IF NOT EXISTS account_sessions (
    token TEXT PRIMARY KEY,
    owner TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    session TEXT NOT NULL,
    expires BIGINT NOT NULL
  );
`;

async function runTx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await txStorage.run(client, () => fn(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function getStore(): StoredPool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString)
    throw new Error('DATABASE_URL 환경 변수가 필요합니다.');
  const sslMode = (process.env.DATABASE_SSL || '').trim().toLowerCase();
  const current = globalPg.tourpassPg;
  if (
    current?.connectionString === connectionString &&
    current.sslMode === sslMode
  )
    return current;
  void current?.pool.end().catch(() => {});
  const ssl =
    sslMode === 'require' || sslMode === 'true'
      ? { rejectUnauthorized: true }
      : sslMode === 'no-verify'
        ? { rejectUnauthorized: false }
        : undefined;
  const pool = new Pool({
    connectionString,
    ssl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  return (globalPg.tourpassPg = { connectionString, sslMode, pool });
}

export async function db(): Promise<Pool> {
  const store = getStore();
  if (!store.initialized) {
    store.initialized = runTx(store.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(7342019)');
      await client.query(SCHEMA_SQL);
    }).catch((error) => {
      store.initialized = undefined;
      throw error;
    });
  }
  await store.initialized;
  return store.pool;
}

export async function closePool(): Promise<void> {
  const current = globalPg.tourpassPg;
  globalPg.tourpassPg = undefined;
  if (current) await current.pool.end();
}

async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
) {
  const active = txStorage.getStore();
  return (active ?? (await db())).query<T>(text, values);
}

export async function transaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const existing = txStorage.getStore();
  if (existing) return operation(existing);
  return runTx(await db(), operation);
}

async function deleteSession(client: PoolClient, token: string) {
  await client.query('DELETE FROM sessions WHERE token = $1', [token]);
  await client.query('DELETE FROM account_sessions WHERE token = $1', [token]);
  await client.query('DELETE FROM oauth_states WHERE session = $1', [token]);
}

export const journeyRepository: JourneyRepository = {
  async list(owner) {
    const { rows } = await query<{ data: Journey }>(
      'SELECT data FROM journeys WHERE owner = $1 ORDER BY seq DESC',
      [owner],
    );
    return rows.map((row) => row.data);
  },
  async find(owner, id) {
    const lock = txStorage.getStore() ? ' FOR UPDATE' : '';
    const { rows } = await query<{ data: Journey }>(
      `SELECT data FROM journeys WHERE id = $1 AND owner = $2${lock}`,
      [id, owner],
    );
    return rows[0]?.data;
  },
  async insert(owner, journey) {
    await query(
      'INSERT INTO journeys (id, owner, data) VALUES ($1, $2, $3::jsonb)',
      [journey.id, owner, JSON.stringify(journey)],
    );
  },
  async update(owner, journey) {
    await query(
      'UPDATE journeys SET data = $1::jsonb WHERE id = $2 AND owner = $3',
      [JSON.stringify(journey), journey.id, owner],
    );
  },
  async photo(owner, journey, place) {
    const { rows } = await query<{ id: string; image: Buffer }>(
      'SELECT id, image FROM photos WHERE owner = $1 AND journey = $2 AND place = $3',
      [owner, journey, place],
    );
    return rows[0]
      ? { id: rows[0].id, image: new Uint8Array(rows[0].image) }
      : undefined;
  },
  async photoPlaces(owner, journey) {
    const { rows } = await query<{ place: string }>(
      'SELECT place FROM photos WHERE journey = $1 AND owner = $2',
      [journey, owner],
    );
    return rows.map((row) => row.place);
  },
  async putPhoto(owner, journey, place, photo) {
    await query(
      `INSERT INTO photos (id, owner, journey, place, image)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (journey, place)
       DO UPDATE SET image = EXCLUDED.image, id = EXCLUDED.id`,
      [photo.id, owner, journey, place, Buffer.from(photo.image)],
    );
  },
  transaction: (operation) => transaction(() => operation()),
};

export const sessionRepository: SessionRepository = {
  async owner(hash, now) {
    const { rows } = await query<{ owner: string }>(
      `SELECT COALESCE(a.owner, s.token) AS owner
       FROM sessions s
       LEFT JOIN account_sessions a ON a.token = s.token
       WHERE s.token = $1 AND s.expires > $2`,
      [hash, now],
    );
    return rows[0]?.owner;
  },
  async insert(owner, expires) {
    await query('INSERT INTO sessions (token, expires) VALUES ($1, $2)', [
      owner,
      expires,
    ]);
  },
};

export const authRepository: AuthRepository = {
  async attempt(state, session, expires) {
    await transaction(async (client) => {
      await client.query(
        'DELETE FROM oauth_states WHERE expires <= $1 OR session = $2',
        [Date.now(), session],
      );
      await client.query(
        'INSERT INTO oauth_states (state, session, expires) VALUES ($1, $2, $3)',
        [state, session, expires],
      );
    });
  },
  async consume(state, session, now) {
    const { rowCount } = await query(
      'DELETE FROM oauth_states WHERE state = $1 AND session = $2 AND expires > $3 RETURNING state',
      [state, session, now],
    );
    return (rowCount ?? 0) > 0;
  },
  async login(previous, next, owner, now) {
    await transaction(async (client) => {
      const { rows } = await client.query<{ owner: string }>(
        `SELECT COALESCE(a.owner, s.token) AS owner
         FROM sessions s
         LEFT JOIN account_sessions a ON a.token = s.token
         WHERE s.token = $1 AND s.expires > $2
         FOR UPDATE OF s`,
        [previous, now],
      );
      const current = rows[0]?.owner;
      if (!current)
        throw new ApplicationError(
          'SESSION_REQUIRED',
          '로그인 세션이 만료되었습니다. 다시 시도해 주세요.',
        );
      if (current === previous) {
        await client.query('UPDATE journeys SET owner = $1 WHERE owner = $2', [
          owner,
          previous,
        ]);
        await client.query('UPDATE photos SET owner = $1 WHERE owner = $2', [
          owner,
          previous,
        ]);
      }
      await deleteSession(client, previous);
      await client.query(
        'INSERT INTO sessions (token, expires) VALUES ($1, $2)',
        [next, now + 30 * 86400000],
      );
      await client.query(
        'INSERT INTO account_sessions (token, owner) VALUES ($1, $2)',
        [next, owner],
      );
    });
  },
  revoke: (hash) => transaction((client) => deleteSession(client, hash)),
};

export const limits: LimitPort = { consume: consumeLimit };

export async function consumeLimit(key: string, maximum: number) {
  const hour = Math.floor(Date.now() / 3600000);
  const bucket = `${key}:${hour}`;
  const { rows } = await query<{ count: number }>(
    `INSERT INTO limits (key, count)
     VALUES ($1, 1)
     ON CONFLICT (key) DO UPDATE SET count = limits.count + 1
     RETURNING count`,
    [bucket],
  );
  const store = getStore();
  if (store.lastLimitPruneHour !== hour) {
    store.lastLimitPruneHour = hour;
    await query(
      `DELETE FROM limits
       WHERE key ~ ':[0-9]+$'
         AND substring(key from ':([0-9]+)$')::bigint < $1`,
      [hour - 1],
    ).catch(() => {});
  }
  return rows[0].count <= maximum;
}
