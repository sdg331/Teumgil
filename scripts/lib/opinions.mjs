import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const readRepoFile = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
export const outputSchema = JSON.parse(readRepoFile('docs/prompts/opinion-draft.schema.json'));
export const dataset = JSON.parse(readRepoFile('evals/opinions/cases.json'));
const validateSchema = new Ajv({ allErrors: true, strict: true }).compile(outputSchema);
const contentFields = ['title', 'location', 'observed_at', 'situation', 'request'];

export function fingerprints() {
  const sha256 = (path) => createHash('sha256').update(readRepoFile(path).replace(/\r\n/g, '\n')).digest('hex');
  return {
    prompt_sha256: sha256('docs/prompts/opinion-draft.system.md'),
    schema_sha256: sha256('docs/prompts/opinion-draft.schema.json'),
    dataset_sha256: sha256('evals/opinions/cases.json'),
  };
}

export function validateOpinionOutput(output) {
  if (!validateSchema(output)) {
    return {
      ok: false,
      errors: validateSchema.errors.map((error) => `${error.instancePath || '/'}: ${error.message}`),
    };
  }
  const errors = [];
  for (const field of contentFields) {
    if (typeof output[field] === 'string' && !output[field].trim()) errors.push(`${field}: blank text`);
  }
  for (const note of output.review_notes) {
    if (!note.trim()) errors.push('review_notes: blank text');
  }
  if (new Set(output.missing_fields).size !== output.missing_fields.length) {
    errors.push('missing_fields: duplicate fields');
  }
  for (const question of output.questions) {
    if (!output.missing_fields.includes(question.field)) errors.push('questions: field must be in missing_fields');
    if (!question.question.trim()) errors.push('questions: blank question');
  }
  if (output.status === 'out_of_scope') {
    if (contentFields.some((field) => output[field] !== null)) errors.push('out_of_scope: content must be null');
    if (output.missing_fields.length || output.questions.length) errors.push('out_of_scope: fields and questions must be empty');
    if (!output.review_notes.length) errors.push('out_of_scope: guidance required');
  } else {
    for (const field of ['location', 'observed_at', 'situation']) {
      if (output[field] === null && !output.missing_fields.includes(field)) {
        errors.push(`${field}: null must be listed in missing_fields`);
      }
    }
    if (output.status === 'draft' && (output.title === null || output.situation === null)) {
      errors.push('draft: title and situation required');
    }
    if (output.status === 'needs_input' && output.situation !== null) {
      errors.push('needs_input: situation must be null');
    }
  }
  return { ok: errors.length === 0, errors };
}

export function gradeCase(testCase, output) {
  const result = validateOpinionOutput(output);
  if (!result.ok) return result;
  const errors = [];
  const expected = testCase.expect;
  if (output.status !== expected.status) errors.push(`status: expected ${expected.status}`);
  for (const field of expected.null_fields ?? []) {
    if (output[field] !== null) errors.push(`${field}: expected null`);
  }
  for (const [field, value] of Object.entries(expected.equals ?? {})) {
    if (output[field] !== value) errors.push(`${field}: expected exact fixture value`);
  }
  const text = JSON.stringify(output);
  for (const phrase of expected.contains ?? []) {
    if (!text.includes(phrase)) errors.push(`required phrase missing: ${phrase}`);
  }
  for (const phrase of expected.excludes ?? []) {
    if (text.includes(phrase)) errors.push(`forbidden fixture phrase: ${phrase}`);
  }
  for (const field of expected.question_fields ?? []) {
    if (!output.questions.some((question) => question.field === field)) errors.push(`confirmation question required: ${field}`);
  }
  return { ok: errors.length === 0, errors };
}

export function evaluateRun(run, cases = dataset.cases, hashes = fingerprints()) {
  if (!run || typeof run !== 'object' || !run.metadata || !Array.isArray(run.results)) {
    throw new Error('Expected an object with metadata and results.');
  }
  const metadata = run.metadata;
  if (!['model', 'template', 'manual', 'fixture'].includes(metadata.source)) throw new Error('Unknown metadata.source.');
  if (metadata.source === 'model' && (
    typeof metadata.provider !== 'string' || !metadata.provider.trim()
    || typeof metadata.model !== 'string' || !metadata.model.trim()
  )) {
    throw new Error('Model outputs require provider and model metadata.');
  }
  for (const [key, value] of Object.entries(hashes)) {
    if (metadata[key] !== value) throw new Error(`Version mismatch: ${key}. Regenerate outputs or use the matching repository version.`);
  }
  const caseMap = new Map(cases.map((entry) => [entry.id, entry]));
  if (caseMap.size !== cases.length || !cases.length || cases.some((entry) => typeof entry.id !== 'string' || !entry.id.trim())) {
    throw new Error('Evaluation case ids must be unique and nonempty.');
  }
  const seen = new Set();
  const results = [];
  for (const entry of run.results) {
    if (!entry || !caseMap.has(entry.case_id)) throw new Error('Unknown or missing case_id.');
    if (seen.has(entry.case_id)) throw new Error(`Duplicate case_id: ${entry.case_id}`);
    seen.add(entry.case_id);
    results.push({ case_id: entry.case_id, ...gradeCase(caseMap.get(entry.case_id), entry.output) });
  }
  if (seen.size !== cases.length) throw new Error(`Incomplete evaluation: expected ${cases.length} cases, received ${seen.size}.`);
  return {
    execution: metadata.source === 'fixture' ? 'fixture-reference-check' : 'imported-output-check',
    source: metadata.source,
    model_identity: metadata.source === 'model' ? 'caller-declared; no API call performed by this runner' : 'not applicable',
    declared_model: metadata.source === 'model' ? { provider: metadata.provider, model: metadata.model } : null,
    fingerprints: hashes,
    total: results.length,
    passed: results.filter((entry) => entry.ok).length,
    outcome: results.every((entry) => entry.ok) ? 'passed' : 'failed',
    results,
  };
}

export function referenceRun() {
  return {
    metadata: { source: 'fixture', ...fingerprints() },
    results: dataset.cases.map((entry) => ({
      case_id: entry.id,
      output: structuredClone({ ...dataset.reference_defaults, ...entry.reference }),
    })),
  };
}
