import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { createApplication } from '../../src/server/application.ts';
import { readConfig } from '../../src/server/config.ts';
import { seedSampleCatalog } from '../../src/server/seed.ts';
import { account, session, user } from '../../src/server/schema.ts';

const baseUrl = 'http://localhost:3000';
const secret = randomBytes(48).toString('base64url');
const suffix = randomUUID();
const password = 'Synthetic-account-password-42!';
let app: Awaited<ReturnType<typeof createApplication>>;
let ip = 0;

function request(path: string, body?: unknown, cookie?: string, origin = baseUrl) {
  return new Request(`${baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json', Origin: origin,
      'X-Forwarded-For': `192.0.2.${(++ip % 250) + 1}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function cookieOf(response: Response) {
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some((cookie) => /httponly/i.test(cookie)));
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function signUp(name: string) {
  const email = `${name}-${suffix}@example.invalid`;
  const response = await app.handle(request('/api/auth/sign-up/email', { name, email, password }));
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  return { id: result.user.id as string, email, cookie: cookieOf(response) };
}

before(async () => {
  app = await createApplication(readConfig({
    DATABASE_URL: process.env.TEUMGIL_TEST_DATABASE_URL ?? 'pglite://',
    BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: baseUrl, NODE_ENV: 'test',
  }));
  await app.connection.migrate();
  await app.connection.migrate();
  await seedSampleCatalog(app.connection.db);
  await seedSampleCatalog(app.connection.db);
});

after(async () => { await app?.connection.close(); });

test('catalog seed and migrations are repeatable; search preserves market boundaries and unknown stock', async () => {
  const markets = await (await app.handle(request('/api/markets'))).json();
  assert.equal(markets.markets.length, 2);
  assert.ok(markets.markets.every((market: { isSample: boolean }) => market.isSample));
  const response = await app.handle(request('/api/markets/sample-haetsal/stores?q=대파'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.stores.length, 1);
  assert.equal(data.stores[0].id, 'sample-pureun');
  assert.equal(data.stores[0].marketId, 'sample-haetsal');
  assert.equal(data.stores[0].inventory, null);
  assert.equal(data.stores[0].price, null);
  assert.equal(data.stores[0].checkedAt, null);
  assert.equal(data.stores[0].isSample, true);
  const detail = await (await app.handle(request('/api/stores/sample-pureun?marketId=sample-haetsal'))).json();
  assert.deepEqual(detail.store, data.stores[0]);
});

test('missing markets, mismatched store context, empty search, wildcard and SQL input remain distinct', async () => {
  assert.equal((await app.handle(request('/api/markets/absent/stores'))).status, 404);
  assert.equal((await app.handle(request('/api/stores/sample-pureun?marketId=sample-gangbyeon'))).status, 404);
  assert.equal((await app.handle(request('/api/stores/sample-pureun?marketId='))).status, 404);
  for (const q of ['없는재료', '%', "' OR 1=1 --"]) {
    const response = await app.handle(request(`/api/markets/sample-haetsal/stores?q=${encodeURIComponent(q)}`));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).stores, []);
  }
  assert.equal((await app.handle(request(`/api/markets?q=${'가'.repeat(101)}`))).status, 400);
  assert.equal((await app.handle(request('/api/markets/%E0%A4%A/stores'))).status, 400);
  const write = await app.handle(request('/api/markets', {}));
  assert.equal(write.status, 405);
  assert.equal(write.headers.get('Allow'), 'GET');
});

test('signup stores a password hash and database session; anonymous and forged sessions are rejected', async () => {
  const alice = await signUp('alice');
  const [credential] = await app.connection.db.select().from(account).where(eq(account.userId, alice.id));
  assert.ok(credential.password);
  assert.notEqual(credential.password, password);
  const storedSessions = await app.connection.db.select().from(session).where(eq(session.userId, alice.id));
  assert.equal(storedSessions.length, 1);
  assert.equal((await app.handle(request('/api/me'))).status, 401);
  assert.equal((await app.handle(request('/api/me', undefined, 'better-auth.session_token=forged'))).status, 401);
  const response = await app.handle(request('/api/me', undefined, alice.cookie));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const data = await response.json();
  assert.equal(data.user.id, alice.id);
  assert.equal(data.user.role, 'citizen');
  assert.equal(data.user.emailVerified, false);
  assert.equal(data.user.password, undefined);
  assert.equal(data.session, undefined);
});

test('two accounts see only their own identity even when a different user ID or role is supplied', async () => {
  const first = await signUp('first');
  const second = await signUp('second');
  const response = await app.handle(request(`/api/me?userId=${first.id}&role=operator`, undefined, second.cookie));
  const data = await response.json();
  assert.equal(data.user.id, second.id);
  assert.equal(data.user.email, second.email);
  assert.equal(data.user.role, 'citizen');
  assert.ok(!JSON.stringify(data).includes(first.email));
});

test('client signup or update cannot grant merchant or operator privileges', async () => {
  const email = `elevation-${suffix}@example.invalid`;
  const response = await app.handle(request('/api/auth/sign-up/email', { name: 'citizen', email, password, role: 'operator' }));
  const records = await app.connection.db.select().from(user).where(eq(user.email, email));
  assert.ok(records.every((record) => record.role === 'citizen'));
  assert.ok(response.ok || response.status === 400);
  const person = await signUp('role-update');
  await app.handle(request('/api/auth/update-user', { role: 'merchant', name: '시민' }, person.cookie));
  const [record] = await app.connection.db.select().from(user).where(eq(user.id, person.id));
  assert.equal(record.role, 'citizen');
});

test('password authentication rejects wrong passwords and signout revokes the session in the database', async () => {
  const person = await signUp('signin');
  const wrong = await app.handle(request('/api/auth/sign-in/email', { email: person.email, password: 'Wrong-password-42!' }));
  assert.equal(wrong.status, 401);
  const login = await app.handle(request('/api/auth/sign-in/email', { email: person.email, password }));
  assert.equal(login.status, 200);
  const secondDevice = cookieOf(login);
  assert.equal((await app.handle(request('/api/auth/sign-out', {}, person.cookie))).status, 200);
  assert.equal((await app.handle(request('/api/me', undefined, person.cookie))).status, 401);
  assert.equal((await app.handle(request('/api/me', undefined, secondDevice))).status, 200);
  await app.connection.db.update(session).set({ expiresAt: new Date(0) }).where(eq(session.userId, person.id));
  assert.equal((await app.handle(request('/api/me', undefined, secondDevice))).status, 401);
});

test('untrusted origins cannot create accounts; short passwords are rejected', async () => {
  const email = `foreign-${suffix}@example.invalid`;
  const response = await app.handle(request('/api/auth/sign-up/email', { name: 'foreign', email, password }, undefined, 'https://foreign.example.invalid'));
  assert.equal(response.status, 403);
  assert.equal((await app.connection.db.select().from(user).where(eq(user.email, email))).length, 0);
  const short = await app.handle(request('/api/auth/sign-up/email', { name: 'short', email, password: 'short' }));
  assert.ok(short.status >= 400 && short.status < 500);
});

test('local server file storage retains accounts and sessions after closing and reopening the application', async () => {
  const root = await mkdtemp(join(tmpdir(), 'teumgil-server-db-'));
  const config = readConfig({ DATABASE_URL: `pglite://${join(root, 'pgdata')}`, BETTER_AUTH_URL: baseUrl, BETTER_AUTH_SECRET: secret });
  let local = await createApplication(config);
  try {
    await local.connection.migrate();
    const signup = await local.handle(request('/api/auth/sign-up/email', { name: 'persistent', email: `persistent-${suffix}@example.invalid`, password }));
    assert.equal(signup.status, 200, await signup.clone().text());
    const cookie = cookieOf(signup);
    const { user: identity } = await signup.json();
    await local.connection.close();
    local = await createApplication(config);
    const response = await local.handle(request('/api/me', undefined, cookie));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.id, identity.id);
  } finally {
    await local.connection.close();
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${process.platform === 'win32' ? '\\' : '/'}teumgil-server-db-`)) throw new Error('Unexpected temporary path.');
    await rm(root, { recursive: true, force: true });
  }
});
