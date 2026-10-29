import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSpecIds } from './lib/spec-ids.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const documents = new Map();
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.isFile() && entry.name.endsWith('.md')) documents.set(relative(root, path).split('\\').join('/'), readFileSync(path, 'utf8'));
  }
}
try {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) documents.set(entry.name, readFileSync(join(root, entry.name), 'utf8'));
  }
  visit(join(root, 'docs'));
  const skills = join(root, '.agents', 'skills');
  if (existsSync(skills)) {
    for (const entry of readdirSync(skills, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('teumgil-')) visit(join(skills, entry.name));
    }
  }
  const registry = JSON.parse(readFileSync(join(root, 'docs', 'spec-ids.json'), 'utf8'));
  const result = checkSpecIds(registry, documents);
  for (const error of result.errors) console.error(error);
  console.log('Specification IDs: ' + result.active + ' active, ' + result.retired + ' retired; ' + result.screens + ' screens, ' + result.conditions + ' registered acceptance conditions');
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
