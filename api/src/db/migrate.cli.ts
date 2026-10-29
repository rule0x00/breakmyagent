import { Pool } from 'pg';
import { runMigrations } from './migrate';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: url });
  try {
    const applied = await runMigrations(pool);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
