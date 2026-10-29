import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Windows workspace watchers can lock an actively appended trace file.
// Record outside the checkout; copy only after Playwright has closed every context.
const root = fileURLToPath(new URL('../', import.meta.url));
const runName = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${process.pid}`;
const destination = join(root, '.harness', 'playwright', 'runs', runName);
const temporary = process.platform === 'win32' ? await mkdtemp(join(tmpdir(), 'teumgil-browser-')) : null;
const output = temporary ? join(temporary, 'results') : join(destination, 'results');
await mkdir(destination, { recursive: true });
const args = ['test', ...process.argv.slice(2), '--output', output];
const child = spawn(process.execPath, [join(root, 'node_modules', '@playwright', 'test', 'cli.js'), ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
const code = await new Promise((resolveCode, reject) => {
  child.once('error', reject);
  child.once('exit', (status) => resolveCode(status ?? 1));
});
if (temporary) {
  try { await cp(output, join(destination, 'results'), { recursive: true, errorOnExist: true, force: false }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Only this mkdtemp directory is eligible for removal; existing runs stay intact.
  if (resolve(dirname(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith('teumgil-browser-')) throw new Error('Unexpected browser temporary directory.');
  await rm(temporary, { recursive: true, force: true });
}
await writeFile(join(root, '.harness', 'playwright', 'last-run.json'), JSON.stringify({ completedAt: new Date().toISOString(), exitCode: code, results: join(destination, 'results') }, null, 2));
console.log(`Browser results: ${destination}`);
process.exitCode = code;
