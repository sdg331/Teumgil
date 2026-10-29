import assert from 'node:assert/strict';
import test from 'node:test';
import { dataset, evaluateRun, fingerprints, gradeCase, referenceRun, validateOpinionOutput } from '../scripts/lib/opinions.mjs';

const fixture = (id = 'basic') => structuredClone(referenceRun().results.find((entry) => entry.case_id === id).output);

test('schema accepts a reference and does not coerce an invalid value', () => {
  assert.equal(validateOpinionOutput(fixture()).ok, true);
  const output = fixture();
  output.observed_at = 123;
  assert.equal(validateOpinionOutput(output).ok, false);
  assert.equal(output.observed_at, 123);
});

for (const [name, mutate] of [
  ['unrecognised fields', (output) => { output.official_submitted = true; }],
  ['unrecognised status', (output) => { output.status = 'resolved'; }],
  ['changed official notice', (output) => { output.notice = '공식 접수 완료'; }],
  ['duplicate missing fields', (output) => { output.missing_fields.push('location'); }],
  ['question without matching missing field', (output) => { output.questions[0].field = 'situation'; }],
  ['missing null-field marker', (output) => { output.missing_fields = ['location']; output.questions = []; }],
  ['draft without situation', (output) => { output.situation = null; output.missing_fields.push('situation'); }],
  ['blank title', (output) => { output.title = ' '; }],
  ['blank question', (output) => { output.questions[0].question = ' '; }],
  ['too many questions', (output) => { output.questions = Array(4).fill(output.questions[0]); }],
]) {
  test(`rejects ${name}`, () => {
    const output = fixture();
    mutate(output);
    assert.equal(validateOpinionOutput(output).ok, false);
  });
}

test('out-of-scope output cannot contain invented event details', () => {
  const output = fixture('unrelated');
  output.location = '가상시장 북문';
  assert.equal(validateOpinionOutput(output).ok, false);
});

test('out-of-scope output requires guidance', () => {
  const output = fixture('unrelated');
  output.review_notes = [];
  assert.equal(validateOpinionOutput(output).ok, false);
});

test('needs-input status cannot contradict a usable situation', () => {
  const output = fixture();
  output.status = 'needs_input';
  assert.equal(validateOpinionOutput(output).ok, false);
});

test('case expectations catch unsupported dates and missing conflict questions', () => {
  const basic = dataset.cases.find((entry) => entry.id === 'basic');
  const output = fixture();
  output.observed_at = '2026-10-28';
  assert.equal(gradeCase(basic, output).ok, false);
  const conflict = dataset.cases.find((entry) => entry.id === 'location-conflict');
  const conflictOutput = fixture('location-conflict');
  conflictOutput.questions = [];
  assert.equal(gradeCase(conflict, conflictOutput).ok, false);
});

test('case expectations catch injected tokens and leaked personal data', () => {
  for (const [id, value] of [['mixed-injection', 'HACKED_7391'], ['personal-data', '010-1234-5678']]) {
    const output = fixture(id);
    output.situation += value;
    assert.equal(gradeCase(dataset.cases.find((entry) => entry.id === id), output).ok, false);
  }
});

test('reference report is explicitly model-free and excludes raw inputs and outputs', () => {
  const report = evaluateRun(referenceRun());
  assert.equal(report.execution, 'fixture-reference-check');
  assert.equal(report.source, 'fixture');
  assert.equal(report.total, 13);
  assert.equal(report.passed, report.total);
  assert.equal(JSON.stringify(report).includes('original_text'), false);
  assert.equal(JSON.stringify(report).includes('010-1234-5678'), false);
});

test('incomplete, duplicate and unknown evaluation cases fail closed', () => {
  const run = referenceRun();
  run.results.pop();
  assert.throws(() => evaluateRun(run), /Incomplete evaluation/);
  const duplicate = referenceRun();
  duplicate.results.push(duplicate.results[0]);
  assert.throws(() => evaluateRun(duplicate), /Duplicate case_id/);
  const unknown = referenceRun();
  unknown.results[0].case_id = 'unknown';
  assert.throws(() => evaluateRun(unknown), /Unknown or missing case_id/);
});

test('version mismatch prevents comparing outputs from a different prompt', () => {
  for (const key of Object.keys(fingerprints())) {
    const run = referenceRun();
    run.metadata[key] = 'wrong-version';
    assert.throws(() => evaluateRun(run), /Version mismatch/);
  }
});

test('imported model outputs require identity and remain labelled as imported', () => {
  const run = referenceRun();
  run.metadata.source = 'model';
  assert.throws(() => evaluateRun(run), /require provider and model/);
  run.metadata.provider = 'example-provider';
  run.metadata.model = 'example-model';
  const report = evaluateRun(run);
  assert.equal(report.execution, 'imported-output-check');
  assert.match(report.model_identity, /caller-declared/);
  assert.deepEqual(report.declared_model, { provider: 'example-provider', model: 'example-model' });
});
