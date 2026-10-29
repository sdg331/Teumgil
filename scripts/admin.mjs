import { eq } from 'drizzle-orm';
import { connectDatabase } from '../src/server/database.ts';
import { assignRole } from '../src/server/administration.ts';
import { user } from '../src/server/schema.ts';

const args = process.argv.slice(2);
const action = args.shift();
const flags = {};
while (args.length) { const name = args.shift(); const value = args.shift(); if (!name?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Use --name value pairs.'); flags[name.slice(2)] = value; }
if (!['grant','revoke'].includes(action) || !flags.email || !flags.actor || !flags.reason) throw new Error('Usage: admin.mjs grant|revoke --email account --role operator|merchant --markets id,id OR --stores id,id --actor administrator --reason explanation. revoke sets citizen and clears scopes.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const connection = await connectDatabase(process.env.DATABASE_URL);
try {
  const [person] = await connection.db.select().from(user).where(eq(user.email, flags.email)); if (!person) throw new Error('Account not found. Create an account first.');
  const result = await assignRole(connection.db, {userId:person.id,role:action==='revoke'?'citizen':flags.role,marketIds:action==='revoke'?[]:(flags.markets?.split(',').filter(Boolean)??[]),storeIds:action==='revoke'?[]:(flags.stores?.split(',').filter(Boolean)??[]),actor:flags.actor,reason:flags.reason});
  console.log(JSON.stringify({ ...result, sessionsRevoked: result.changed }));
} finally { await connection.close(); }
