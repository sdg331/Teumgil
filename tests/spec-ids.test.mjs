import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSpecIds } from '../scripts/lib/spec-ids.mjs';

function fixture() {
  return {
    registry: {
      version: 1,
      catalog: 'docs/PRODUCT.md',
      definitions: {
        'docs/PRODUCT.md': ['R1'],
        'docs/screens/ONE.md': ['S01', 'S01-O1', 'S01-T1'],
      },
      retired: [],
      next: { R: 2, S: 2, 'S01-O': 2, 'S01-T': 2 },
    },
    documents: new Map([
      ['docs/PRODUCT.md', '| R1 | Rule |\n| S01 | One | [detail](screens/ONE.md) |\n'],
      ['docs/screens/ONE.md', '## S01 One\n### S01-O1 Operation\n| S01-T1 | Condition |\n'],
      ['README.md', 'R1 and S01 refer to one screen.\n'],
    ]),
  };
}

test('accepts stable IDs and ignores fenced examples', () => {
  const { registry, documents } = fixture();
  documents.set('README.md', 'R1 S01 S01-O1 S01-T1\n~~~text\nS99\n~~~\n');
  const result = checkSpecIds(registry, documents);
  assert.equal(result.ok, true);
  assert.equal(result.active, 4);
  assert.equal(result.conditions, 1);
});

test('rejects duplicate allocations and duplicate definitions', () => {
  const { registry, documents } = fixture();
  registry.definitions['docs/screens/ONE.md'].push('R1');
  documents.set('docs/screens/ONE.md', documents.get('docs/screens/ONE.md') + '## S01 Again\n');
  const result = checkSpecIds(registry, documents);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('Duplicate registration: R1')));
  assert.ok(result.errors.some(error => error.includes('Duplicate definition S01')));
});

test('rejects a registered ID whose definition was deleted', () => {
  const { registry, documents } = fixture();
  documents.set('docs/screens/ONE.md', '## S01 One\n### S01-O1 Operation\n');
  const result = checkSpecIds(registry, documents);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('Missing definition in registered source: S01-T1'));
});

test('finds unknown IDs and IDs hidden inside a referenced range', () => {
  const { registry, documents } = fixture();
  documents.set('README.md', 'S99 and R1–R3\n');
  const result = checkSpecIds(registry, documents);
  assert.equal(result.ok, false);
  for (const id of ['S99', 'R2', 'R3']) assert.ok(result.errors.some(error => error.includes('Unknown ID reference ' + id)));
});

test('rejects criteria and operations under the wrong screen', () => {
  const { registry, documents } = fixture();
  documents.set('docs/screens/ONE.md', '## S02 Wrong\n### S01-O1 Operation\n| S01-T1 | Condition |\n');
  const result = checkSpecIds(registry, documents);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('Wrong screen parent for S01-T1')));
  assert.ok(result.errors.some(error => error.includes('Wrong screen parent for S01-O1')));
});

test('rejects an existing but incorrect catalog destination', () => {
  const { registry, documents } = fixture();
  documents.set('docs/PRODUCT.md', '| R1 | Rule |\n| S01 | One | [detail](screens/OTHER.md) |\n');
  documents.set('docs/screens/OTHER.md', '# Unrelated\n');
  const result = checkSpecIds(registry, documents);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('Catalog target differs from ID owner S01')));
});

test('keeps retired allocations and rejects reuse or remaining references', () => {
  const { registry, documents } = fixture();
  registry.definitions['docs/PRODUCT.md'] = [];
  registry.retired.push({ id: 'R1', reason: 'No longer applicable', replaced_by: [] });
  documents.set('docs/PRODUCT.md', '| S01 | One | [detail](screens/ONE.md) |\n');
  documents.set('README.md', 'S01\n');
  assert.equal(checkSpecIds(registry, documents).ok, true);
  documents.set('README.md', 'R1\n');
  assert.ok(checkSpecIds(registry, documents).errors.some(error => error.includes('Retired ID reference R1')));
  registry.definitions['docs/PRODUCT.md'].push('R1');
  assert.ok(checkSpecIds(registry, documents).errors.includes('Reused or duplicate retired ID: R1'));
});

test('rejects missing allocation history and incorrect next counters', () => {
  const { registry, documents } = fixture();
  registry.definitions['docs/PRODUCT.md'].push('R3');
  registry.next.R = 4;
  documents.set('docs/PRODUCT.md', documents.get('docs/PRODUCT.md') + '| R3 | Third rule |\n');
  let result = checkSpecIds(registry, documents);
  assert.ok(result.errors.includes('Missing allocation/tombstone: R2'));
  registry.next.S = 3;
  result = checkSpecIds(registry, documents);
  assert.ok(result.errors.includes('Incorrect next allocation: S'));
});

test('reports invalid registry structure instead of accepting it', () => {
  assert.equal(checkSpecIds({}, new Map()).ok, false);
});

test('allows retired IDs in explicit history but not unknown IDs', () => {
  const { registry, documents } = fixture();
  registry.definitions['docs/PRODUCT.md'] = [];
  registry.retired.push({ id: 'R1', reason: 'Retired rule', replaced_by: [] });
  documents.set('docs/PRODUCT.md', '| S01 | One | [detail](screens/ONE.md) |\n');
  documents.set('README.md', '<!-- spec-ids:history:start -->\nR1 existed before.\n<!-- spec-ids:history:end -->\n');
  assert.equal(checkSpecIds(registry, documents).ok, true);
  documents.set('README.md', '<!-- spec-ids:history:start -->\nR99\n<!-- spec-ids:history:end -->\n');
  assert.ok(checkSpecIds(registry, documents).errors.some(error => error.includes('Unknown ID reference R99')));
});

test('does not count hidden history as an active definition and rejects unclosed history', () => {
  const { registry, documents } = fixture();
  documents.set('docs/screens/ONE.md', '<!-- spec-ids:history:start -->\n' + documents.get('docs/screens/ONE.md'));
  const result = checkSpecIds(registry, documents);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('Missing definition in registered source: S01'));
  assert.ok(result.errors.some(error => error.includes('Unclosed ID history block')));
});
