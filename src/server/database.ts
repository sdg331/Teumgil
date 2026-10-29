import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { drizzle as postgresDrizzle } from 'drizzle-orm/node-postgres';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';
import * as schema from './schema.ts';

export async function connectDatabase(connectionString: string) {
  const migrationsFolder = resolve('drizzle');
  if (connectionString.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const directory = connectionString.slice('pglite://'.length);
    if (directory) await mkdir(dirname(resolve(directory)), { recursive: true });
    const client = new PGlite(directory ? resolve(directory) : undefined);
    await client.waitReady;
    const db = pgliteDrizzle(client, { schema });
    return { db, migrate: () => migratePglite(db, { migrationsFolder }), close: () => client.close() };
  }
  if (!/^postgres(?:ql)?:\/\//.test(connectionString)) throw new Error('Unsupported database connection.');
  const client = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000 });
  const db = postgresDrizzle(client, { schema });
  async function migrate() {
    // Separate processes may bootstrap the same empty PostgreSQL database at once.
    // Pin the advisory lock and migrator to one connection; a Pool-wide lock could
    // otherwise be acquired and released on unrelated sessions.
    const migrationClient = await client.connect();
    let locked = false;
    try {
      await migrationClient.query('select pg_advisory_lock(821796454)');
      locked = true;
      await migratePostgres(postgresDrizzle(migrationClient, { schema }), { migrationsFolder });
    } finally {
      try { if (locked) await migrationClient.query('select pg_advisory_unlock(821796454)'); }
      finally { migrationClient.release(); }
    }
  }
  return { db, migrate, close: () => client.end() };
}

export type DatabaseConnection = Awaited<ReturnType<typeof connectDatabase>>;
