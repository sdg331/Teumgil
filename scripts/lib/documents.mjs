import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const excludedDirectories = new Set(['.git', 'node_modules', '.harness', '.agents', '.codex', '.next', 'out']);

export function checkDocuments(root, { additionalDirectories = [] } = {}) {
  const errors = [];
  const documents = new Set();
  let linksChecked = 0;
  let jsonExamples = 0;
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !excludedDirectories.has(entry.name)) visit(path);
      else if (entry.isFile() && path.endsWith('.md')) documents.add(path);
    }
  }
  visit(root);
  // Installed vendor skills remain excluded. Explicit project-owned additions
  // use the same link/fence checks, with the repository as the path boundary.
  const canonicalRoot = realpathSync(root);
  for (const directory of additionalDirectories) {
    const path = resolve(root, directory);
    const fromRoot = relative(resolve(root), path);
    if (isAbsolute(directory) || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) {
      errors.push(`Additional document directory leaves repository: ${directory}`);
      continue;
    }
    if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) {
      errors.push(`Additional document directory is missing or not a regular directory: ${directory}`);
      continue;
    }
    const realRelative = relative(canonicalRoot, realpathSync(path));
    if (realRelative === '..' || realRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(realRelative)) {
      errors.push(`Additional document directory resolves outside repository: ${directory}`);
      continue;
    }
    visit(path);
  }
  for (const path of documents) {
    let fence = null;
    let block = [];
    const label = relative(root, path);
    for (const [index, line] of readFileSync(path, 'utf8').split(/\r?\n/).entries()) {
      const match = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (match) {
        if (!fence) {
          fence = { marker: match[1][0], size: match[1].length, language: match[2].trim(), line: index + 1 };
          block = [];
        } else if (match[1][0] === fence.marker && match[1].length >= fence.size && !match[2].trim()) {
          if (fence.language === 'json') {
            try { JSON.parse(block.join('\n')); jsonExamples++; }
            catch { errors.push(`${label}:${fence.line}: invalid JSON example`); }
          }
          fence = null;
        } else block.push(line);
        continue;
      }
      if (fence) { block.push(line); continue; }
      for (const link of line.matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) {
        const target = link[1];
        if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;
        try {
          const targetPath = decodeURIComponent(target.split('#')[0]);
          const absolutePath = resolve(path, '..', targetPath);
          const fromRoot = relative(resolve(root), absolutePath);
          if (isAbsolute(targetPath) || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) {
            errors.push(`${label}:${index + 1}: local link leaves repository`);
          } else if (!existsSync(absolutePath)) errors.push(`${label}:${index + 1}: missing local link ${target}`);
          linksChecked++;
        } catch { errors.push(`${label}:${index + 1}: malformed local link`); }
      }
    }
    if (fence) errors.push(`${label}:${fence.line}: unclosed code fence`);
  }
  return { ok: errors.length === 0, documents: documents.size, linksChecked, jsonExamples, errors };
}
