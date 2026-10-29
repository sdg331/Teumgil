import { randomUUID } from 'node:crypto';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { connectDatabase, type DatabaseConnection } from './database.ts';
import { createAuth } from './auth.ts';
import { readConfig, type ServiceConfig } from './config.ts';
import { markets, stores } from './schema.ts';
import { createDomain, HttpError } from './domain.ts';
import type { Identity } from '../lib/contracts.ts';

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function searchTerm(url: URL) {
  const term = (url.searchParams.get('q') ?? '').trim();
  if (term.length > 100) return null;
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

function storeView(record: typeof stores.$inferSelect) {
  return { ...record, inventory: null, price: null };
}

function decodeId(value: string) {
  try { return decodeURIComponent(value); }
  catch { return null; }
}

export async function createApplication(config: ServiceConfig, existingConnection?: DatabaseConnection) {
  const connection = existingConnection ?? await connectDatabase(config.databaseUrl);
  const auth = createAuth(connection.db, config);
  const db = connection.db;

  const domain = createDomain(db, config);
  async function route(request: Request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/api/auth/')) {
      const response = await auth.handler(request);
      response.headers.set('Cache-Control', 'no-store');
      return response.status >= 500 ? json({ error: '인증 요청을 처리하지 못했습니다.' }, 503) : response;
    }
    if (/^\/api\/(cart|draft|attachments|opinions|operator|merchant)(?:\/|$)/.test(path)) {
      const identity = await auth.api.getSession({ headers: request.headers });
      if (!identity) return json({ error: '로그인이 필요합니다.', code: 'UNAUTHENTICATED' }, 401);
      const result = await domain(request, identity.user as Identity);
      if (result) return result;
    }
    if (request.method !== 'GET') {
      const response = json({ error: '지원하지 않는 요청입니다.' }, 405);
      response.headers.set('Allow', 'GET');
      return response;
    }
    if (path === '/api/health') {
      await db.execute(sql`select 1`);
      return json({ status: 'ok' });
    }
    if (path === '/api/me') {
      const identity = await auth.api.getSession({ headers: request.headers });
      if (!identity) return json({ error: '로그인이 필요합니다.' }, 401);
      const { id, name, email, emailVerified, role } = identity.user;
      return json({ user: { id, name, email, emailVerified, role } });
    }
    const term = searchTerm(url);
    if (term === null) return json({ error: '검색어는 100자 이내로 입력해 주세요.' }, 400);
    if (path === '/api/markets') {
      const data = await db.select().from(markets).where(ilike(markets.name, term)).orderBy(asc(markets.id)).limit(50);
      return json({ markets: data });
    }
    const marketMatch = /^\/api\/markets\/([^/]+)\/stores$/.exec(path);
    if (marketMatch) {
      const marketId = decodeId(marketMatch[1]);
      if (marketId === null) return json({ error: '올바른 시장 ID가 필요합니다.' }, 400);
      const [market] = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
      if (!market) return json({ error: '시장을 찾을 수 없습니다.' }, 404);
      const data = await db.select().from(stores).where(and(
        eq(stores.marketId, marketId),
        or(ilike(stores.name, term), sql`exists (select 1 from unnest(${stores.usualItems}) as item where item ilike ${term})`),
      )).orderBy(asc(stores.id)).limit(50);
      return json({ market, stores: data.map(storeView) });
    }
    const storeMatch = /^\/api\/stores\/([^/]+)$/.exec(path);
    if (storeMatch) {
      const storeId = decodeId(storeMatch[1]);
      if (storeId === null) return json({ error: '올바른 점포 ID가 필요합니다.' }, 400);
      const marketId = url.searchParams.get('marketId');
      const [store] = await db.select().from(stores).where(and(eq(stores.id, storeId), marketId !== null ? eq(stores.marketId, marketId) : undefined)).limit(1);
      return store ? json({ store: storeView(store) }) : json({ error: '점포를 찾을 수 없습니다.' }, 404);
    }
    return json({ error: '요청한 경로를 찾을 수 없습니다.' }, 404);
  }

  async function handle(request: Request) {
    try { return await route(request); } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message, code: error.code, fields: error.fields }, error.status);
      const databaseError = error as { code?: string; cause?: { code?: string } };
      if (databaseError.code === '23505' || databaseError.cause?.code === '23505') return json({ error: '이미 저장되었거나 같은 내용이 있어요. 최신 내용을 확인해 주세요.', code: 'CONFLICT' }, 409);
      throw error;
    }
  }
  return { auth, connection, handle };
}

type Application = Awaited<ReturnType<typeof createApplication>>;
// Keep the single PGlite file connection across HMR, but rebuild application code.
const runtime = globalThis as typeof globalThis & { teumgilConnection?: Promise<DatabaseConnection> };
let application: Promise<Application> | undefined;

export function getApplication() {
  if (application) return application;
  const config = readConfig();
  runtime.teumgilConnection ??= connectDatabase(config.databaseUrl).catch((error) => {
    delete runtime.teumgilConnection;
    throw error;
  });
  application = runtime.teumgilConnection.then((connection) => createApplication(config, connection)).catch((error) => {
    application = undefined;
    throw error;
  });
  return application;
}

export async function handleApiRequest(request: Request) {
  try {
    return await (await getApplication()).handle(request);
  } catch (error) {
    const requestId = randomUUID();
    console.error('Service request failed', { requestId, errorType: error instanceof Error ? error.name : 'Unknown' });
    return json({ error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', requestId }, 503);
  }
}
