import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

try {
  await writeFile(new URL('../.env.local', import.meta.url), [
    'DATABASE_URL=pglite://.harness/app-db',
    'BETTER_AUTH_URL=http://localhost:3000',
    `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`,
    'NEXT_TELEMETRY_DISABLED=1',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Created private .env.local for local server development.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env.local already exists; retained its settings.');
}
