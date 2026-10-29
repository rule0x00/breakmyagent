import { Client, Pool } from 'pg';
import { runMigrations } from '../../src/db/migrate';
import { TEST_DATABASE_URL, adminUrl } from './test-env';

export default async function globalSetup(): Promise<void> {
  const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  const admin = new Client({ connectionString: adminUrl(TEST_DATABASE_URL) });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Integration tests need Postgres at ${adminUrl(TEST_DATABASE_URL)} (run \`docker compose up -d postgres redis\`): ${(err as Error).message}`,
    );
  }
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await runMigrations(pool);
  await pool.end();
}
