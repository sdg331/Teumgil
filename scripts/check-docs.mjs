import { checkDocuments } from './lib/documents.mjs';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateOpinionOutput } from './lib/opinions.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const skillRoot = join(repoRoot, '.agents', 'skills');
const projectSkills = existsSync(skillRoot)
  ? readdirSync(skillRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('teumgil-'))
    .map((entry) => join('.agents', 'skills', entry.name))
  : [];
const result = checkDocuments(repoRoot, { additionalDirectories: projectSkills });
const promptGuide = readFileSync(new URL('../docs/prompts/README.md', import.meta.url), 'utf8');
let outputExamples = 0;
for (const block of promptGuide.matchAll(/^```json\r?\n([\s\S]*?)^```/gm)) {
  try {
    const value = JSON.parse(block[1]);
    if (Object.hasOwn(value, 'status') && Object.hasOwn(value, 'notice')) {
      outputExamples++;
      const validation = validateOpinionOutput(value);
      result.errors.push(...validation.errors.map((error) => `Prompt guide output example: ${error}`));
    }
  } catch { /* The document scanner reports malformed JSON. */ }
}
if (!outputExamples) result.errors.push('Prompt guide must contain an opinion output example.');
for (const error of result.errors) console.error(error);
console.log(`Documents: ${result.documents}, local links: ${result.linksChecked}, JSON examples: ${result.jsonExamples}`);
if (result.errors.length) process.exitCode = 1;
