import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { readConfig } from '../../src/server/config.ts';

const settings = { DATABASE_URL: 'postgresql://localhost/teumgil', BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'), BETTER_AUTH_URL: 'https://teumgil.example.invalid' };

test('server configuration rejects missing secrets, unsafe origins and development databases in production', () => {
  assert.throws(() => readConfig({}), /required/);
  assert.throws(() => readConfig({ ...settings, BETTER_AUTH_SECRET: 'short' }), /required/);
  for (const origin of ['javascript:alert(1)', 'https://user:pass@example.invalid', 'https://example.invalid/subpath']) {
    assert.throws(() => readConfig({ ...settings, BETTER_AUTH_URL: origin }));
  }
  assert.throws(() => readConfig({ ...settings, NODE_ENV: 'production', BETTER_AUTH_URL: 'http://localhost:3000' }), /HTTPS/);
  assert.throws(() => readConfig({ ...settings, NODE_ENV: 'production', DATABASE_URL: 'pglite://.harness/db' }), /PostgreSQL/);
  assert.equal(readConfig({ ...settings, NODE_ENV: 'production' }).production, true);
});
