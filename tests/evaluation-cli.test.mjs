import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { referenceRun, repoRoot } from '../scripts/lib/opinions.mjs';

test('CLI imports complete results and replaces stale success when an input is rejected', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'teumgil evaluation '));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'manual outputs.json');
  const run = referenceRun();
  run.metadata.source = 'manual';
  const execute = () => spawnSync(process.execPath, ['scripts/evaluate-opinions.mjs', '--file', path], { cwd: repoRoot, encoding: 'utf8' });
  const report = () => JSON.parse(readFileSync(join(repoRoot, '.harness', 'output-report.json'), 'utf8'));

  writeFileSync(path, JSON.stringify(run));
  const valid = execute();
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(report().execution, 'imported-output-check');
  assert.equal(report().source, 'manual');
  assert.equal(report().outcome, 'passed');

  run.results.pop();
  writeFileSync(path, JSON.stringify(run));
  const incomplete = execute();
  assert.equal(incomplete.status, 1);
  assert.match(incomplete.stderr, /Incomplete evaluation/);
  assert.equal(report().outcome, 'rejected');
  assert.equal(report().passed, undefined);

  writeFileSync(path, '{ invalid JSON with PRIVATE_INPUT_7391');
  const invalidJson = execute();
  assert.equal(invalidJson.status, 1);
  assert.equal(report().outcome, 'rejected');
  assert.equal(invalidJson.stderr.includes('PRIVATE_INPUT_7391'), false);
});

test('CLI cannot import fixtures as if they were an external evaluation', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'teumgil evaluation '));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'outputs.json');
  writeFileSync(path, JSON.stringify(referenceRun()));
  const result = spawnSync(process.execPath, ['scripts/evaluate-opinions.mjs', '--file', path], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must identify as model, template, or manual/);
});
