import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const action = process.argv[2] ?? 'status';
if (!['start', 'stop', 'status'].includes(action)) throw new Error('Usage: local-postgres.mjs start|stop|status');
let runtime;
try { runtime = JSON.parse(await readFile('.harness/postgres-runtime.json', 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  throw new Error('No local PostgreSQL installation registry. Configure DATABASE_URL for your PostgreSQL, or use npm run setup:local for PGlite.');
}
if (!runtime.binaryDirectory || !runtime.dataDirectory || !runtime.logFile || !Number.isInteger(runtime.port)) throw new Error('Incomplete local PostgreSQL installation registry.');
const binary = join(runtime.binaryDirectory, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
const status = spawnSync(binary, ['-D', runtime.dataDirectory, 'status'], { encoding: 'utf8', windowsHide: true });
if (status.error) throw status.error;
if (action === 'status') { console.log(status.stdout.trim() || 'Local PostgreSQL is stopped.'); process.exitCode = status.status ?? 1; }
else if ((action === 'start' && status.status === 0) || (action === 'stop' && status.status !== 0)) console.log(action === 'start' ? 'Local PostgreSQL is already running.' : 'Local PostgreSQL is already stopped.');
else {
  const args = action === 'start' ? ['-D', runtime.dataDirectory, '-l', runtime.logFile, '-o', `-h 127.0.0.1 -p ${runtime.port}`, '-w', 'start'] : ['-D', runtime.dataDirectory, '-m', 'fast', '-w', 'stop'];
  const result = spawnSync(binary, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
