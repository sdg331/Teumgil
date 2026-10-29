import type { NextConfig } from 'next';

const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'better-auth', '@better-auth/drizzle-adapter', 'drizzle-orm'],
};

export default config;
