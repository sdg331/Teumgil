import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { DatabaseConnection } from './database.ts';
import type { Role } from '../lib/contracts.ts';
import { markets, merchantStores, operatorMarkets, roleAudits, session, stores, user } from './schema.ts';

/** Trusted server/CLI entry point. It is deliberately never exposed by an HTTP route. */
export async function assignRole(db: DatabaseConnection['db'], input: { userId: string; role: Role; marketIds: string[]; storeIds: string[]; actor: string; reason: string }) {
  if (!input.actor.trim() || !input.reason.trim()) throw new Error('Actor and reason are required.');
  if (!['citizen', 'merchant', 'operator'].includes(input.role)) throw new Error('Invalid role.');
  if (input.role === 'citizen' && (input.marketIds.length || input.storeIds.length)) throw new Error('Citizen cannot receive market or store scope.');
  if (input.role === 'operator' && (!input.marketIds.length || input.storeIds.length)) throw new Error('Operator requires market IDs only.');
  if (input.role === 'merchant' && (!input.storeIds.length || input.marketIds.length)) throw new Error('Merchant requires store IDs only.');
  return db.transaction(async tx => {
    const [person] = await tx.select().from(user).where(eq(user.id, input.userId)).for('update'); if (!person) throw new Error('Account not found.');
    const marketIds = [...new Set(input.marketIds)], storeIds = [...new Set(input.storeIds)];
    if (marketIds.length && (await tx.select().from(markets).where(inArray(markets.id, marketIds))).length !== marketIds.length) throw new Error('Unknown market.');
    if (storeIds.length && (await tx.select().from(stores).where(inArray(stores.id, storeIds))).length !== storeIds.length) throw new Error('Unknown store.');
    const before = { role: person.role, marketIds: (await tx.select().from(operatorMarkets).where(eq(operatorMarkets.userId, person.id))).map(x => x.marketId).sort(), storeIds: (await tx.select().from(merchantStores).where(eq(merchantStores.userId, person.id))).map(x => x.storeId).sort() };
    const after = { role: input.role, marketIds: marketIds.sort(), storeIds: storeIds.sort() };
    if (JSON.stringify(before) === JSON.stringify(after)) return { changed: false, userId: person.id };
    await tx.delete(operatorMarkets).where(eq(operatorMarkets.userId, person.id)); await tx.delete(merchantStores).where(eq(merchantStores.userId, person.id));
    await tx.update(user).set({ role: input.role, updatedAt: new Date() }).where(eq(user.id, person.id));
    if (marketIds.length) await tx.insert(operatorMarkets).values(marketIds.map(marketId => ({ id: randomUUID(), userId: person.id, marketId })));
    if (storeIds.length) await tx.insert(merchantStores).values(storeIds.map(storeId => ({ id: randomUUID(), userId: person.id, storeId })));
    await tx.insert(roleAudits).values({ id: randomUUID(), subjectId: person.id, actor: input.actor.trim(), reason: input.reason.trim(), before, after });
    // Existing credentials must authenticate again after a privilege change.
    await tx.delete(session).where(and(eq(session.userId, person.id)));
    return { changed: true, userId: person.id };
  });
}
