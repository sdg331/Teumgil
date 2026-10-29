import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkDocuments } from '../scripts/lib/documents.mjs';

function workspace(context) {
  const root = mkdtempSync(join(tmpdir(), 'teumgil-harness-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('checks a local link and JSON example without fetching external links', (context) => {
  const root = workspace(context);
  writeFileSync(join(root, 'README.md'), '[guide](guide.md)\n[external](https://example.invalid)\n```json\n{"valid":true}\n```\n');
  writeFileSync(join(root, 'guide.md'), '# Guide\n');
  const result = checkDocuments(root);
  assert.equal(result.ok, true);
  assert.equal(result.linksChecked, 1);
  assert.equal(result.jsonExamples, 1);
});

test('reports broken links, invalid JSON and unclosed fences', (context) => {
  const root = workspace(context);
  writeFileSync(join(root, 'README.md'), '[missing](missing.md)\n```json\n{broken}\n```\n```text\nunclosed\n');
  const result = checkDocuments(root);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 3);
});

test('code samples and dependency folders do not create false document failures', (context) => {
  const root = workspace(context);
  for (const directory of ['node_modules', '.agents', '.codex']) {
    mkdirSync(join(root, directory));
    writeFileSync(join(root, directory, 'README.md'), '[missing](missing.md)\n```\n');
  }
  writeFileSync(join(root, 'README.md'), '```md\n[example](missing.md)\n```\n');
  const result = checkDocuments(root);
  assert.equal(result.ok, true);
  assert.equal(result.documents, 1);
});

test('rejects local paths outside the repository and malformed encodings', (context) => {
  const root = workspace(context);
  writeFileSync(join(root, 'README.md'), '[outside](../outside.md)\n[bad](bad%ZZ.md)\n');
  const result = checkDocuments(root);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});

test('checks project skill references while leaving vendor skills excluded', (context) => {
  const root = workspace(context);
  const owned = join('.agents', 'skills', 'teumgil-example');
  const vendor = join('.agents', 'skills', 'vendor-example');
  mkdirSync(join(root, owned), { recursive: true });
  mkdirSync(join(root, vendor), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# Project\n');
  writeFileSync(join(root, owned, 'SKILL.md'), '[project](../../../README.md)\n[broken](missing.md)\n');
  writeFileSync(join(root, vendor, 'SKILL.md'), '```\n');
  const result = checkDocuments(root, { additionalDirectories: [owned, owned] });
  assert.equal(result.ok, false);
  assert.equal(result.documents, 2);
  assert.equal(result.linksChecked, 2);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /missing local link missing.md/);
});

test('rejects additional document directories outside the repository or absent', (context) => {
  const root = workspace(context);
  writeFileSync(join(root, 'README.md'), '# Project\n');
  const result = checkDocuments(root, { additionalDirectories: ['..', 'absent'] });
  assert.equal(result.ok, false);
  assert.equal(result.documents, 1);
  assert.equal(result.errors.length, 2);
});
