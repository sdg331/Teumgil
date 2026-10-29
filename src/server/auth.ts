import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { DatabaseConnection } from './database.ts';
import type { ServiceConfig } from './config.ts';
import * as schema from './schema.ts';

export function createAuth(db: DatabaseConnection['db'], config: ServiceConfig) {
  return betterAuth({
    appName: '틈길',
    secret: config.secret,
    baseURL: config.baseUrl,
    trustedOrigins: [config.baseUrl],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    user: {
      additionalFields: {
        role: { type: ['citizen', 'merchant', 'operator'], defaultValue: 'citizen', input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: 'database' },
    advanced: { useSecureCookies: config.production },
    logger: { disabled: true },
  });
}
