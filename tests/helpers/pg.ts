import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { closePool } from '../../lib/adapters/postgres';

function baseDatabaseUrl() {
  return (
    process.env.TEST_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    'postgresql://postgres:postgres@127.0.0.1:5432/tourpass_test'
  );
}

export async function setupTestSchema(prefix: string) {
  const baseUrl = baseDatabaseUrl();
  const schema = `test_${prefix}_${randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString: baseUrl });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(baseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();

  return {
    schema,
    url: url.toString(),
    async teardown() {
      await closePool();
      const cleanup = new Pool({ connectionString: baseUrl });
      try {
        await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
