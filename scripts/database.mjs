import { connectDatabase } from '../src/server/database.ts';
import { seedSampleCatalog } from '../src/server/seed.ts';

const action = process.argv[2];
if (!['migrate', 'seed'].includes(action)) throw new Error('Usage: database.mjs migrate|seed');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
if (action === 'seed' && process.env.NODE_ENV === 'production') throw new Error('Sample seed is available only in development or test.');
const connection = await connectDatabase(process.env.DATABASE_URL);
try {
  if (action === 'migrate') await connection.migrate();
  else await seedSampleCatalog(connection.db);
  console.log(action === 'migrate' ? 'Database migrations applied.' : 'Synthetic market catalog seeded.');
} finally {
  await connection.close();
}
