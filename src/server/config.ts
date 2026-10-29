export type ServiceConfig = {
  databaseUrl: string;
  baseUrl: string;
  secret: string;
  production: boolean;
};

export function readConfig(env: Record<string, string | undefined> = process.env): ServiceConfig {
  const databaseUrl = env.DATABASE_URL;
  const secret = env.BETTER_AUTH_SECRET;
  const baseUrl = env.BETTER_AUTH_URL;
  const production = env.NODE_ENV === 'production';
  if (!databaseUrl || !secret || secret.length < 32 || !baseUrl) {
    throw new Error('DATABASE_URL, BETTER_AUTH_URL and a 32+ character BETTER_AUTH_SECRET are required.');
  }
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('BETTER_AUTH_URL must be an HTTP(S) origin without credentials or a path.');
  }
  if (!/^(postgres(?:ql)?:\/\/|pglite:\/\/)/.test(databaseUrl)) {
    throw new Error('DATABASE_URL must select PostgreSQL or development PGlite explicitly.');
  }
  if (production && (url.protocol !== 'https:' || databaseUrl.startsWith('pglite://'))) {
    throw new Error('Production requires HTTPS and shared PostgreSQL.');
  }
  return { databaseUrl, secret, baseUrl: url.origin, production };
}
