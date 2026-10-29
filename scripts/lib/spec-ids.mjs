import { posix } from 'node:path';

const idPattern = /\b(?:S\d+(?:-[TO]\d+)?|[RADC]\d+)\b/g;
const canonicalId = /^(?:S(?:0[1-9]|[1-9]\d+)(?:-[TO][1-9]\d*)?|[RADC][1-9]\d*)$/;

function parts(id) {
  const match = /^(.*?)(\d+)$/.exec(id);
  return match ? { family: match[1], number: Number(match[2]) } : null;
}

function formatId(family, number) {
  return family + (family === 'S' ? String(number).padStart(2, '0') : number);
}

function proseLines(text) {
  let fence = null;
  return text.split(/\r?\n/).map((line, index) => {
    const match = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      if (!fence) fence = { marker: match[1][0], length: match[1].length };
      else if (match[1][0] === fence.marker && match[1].length >= fence.length && !match[2].trim()) fence = null;
      return { line: '', number: index + 1 };
    }
    return { line: fence ? '' : line, number: index + 1 };
  });
}

function references(line) {
  const ids = new Set(line.match(idPattern) ?? []);
  const range = /\b(S\d+(?:-[TO]\d+)?|[RADC]\d+)\s*[–~-]\s*(S\d+(?:-[TO]\d+)?|[RADC]\d+)\b/g;
  for (const match of line.matchAll(range)) {
    const start = parts(match[1]);
    const end = parts(match[2]);
    if (start.family !== end.family || end.number < start.number || end.number - start.number > 1000) continue;
    for (let n = start.number; n <= end.number; n++) ids.add(formatId(start.family, n));
  }
  return ids;
}

// The caller supplies only project-owned Markdown. This function performs no IO.
export function checkSpecIds(registry, documents) {
  const errors = [];
  const active = new Map();
  const retired = new Map();
  if (!registry || registry.version !== 1 || typeof registry.catalog !== 'string'
      || !registry.definitions || Array.isArray(registry.definitions) || typeof registry.definitions !== 'object'
      || !Array.isArray(registry.retired) || !registry.next || Array.isArray(registry.next) || typeof registry.next !== 'object') {
    return { ok: false, errors: ['Invalid specification ID registry.'] };
  }
  for (const [source, ids] of Object.entries(registry.definitions)) {
    if (!documents.has(source)) errors.push('Missing registered source: ' + source);
    if (!Array.isArray(ids)) { errors.push('Expected ID array: ' + source); continue; }
    for (const id of ids) {
      if (typeof id !== 'string' || !canonicalId.test(id)) { errors.push('Invalid ID: ' + id); continue; }
      if (active.has(id)) errors.push('Duplicate registration: ' + id);
      active.set(id, source);
    }
  }
  for (const entry of registry.retired) {
    if (!entry || typeof entry.id !== 'string' || !canonicalId.test(entry.id)
        || typeof entry.reason !== 'string' || !entry.reason.trim() || !Array.isArray(entry.replaced_by)) {
      errors.push('Invalid retired ID record.'); continue;
    }
    if (active.has(entry.id) || retired.has(entry.id)) errors.push('Reused or duplicate retired ID: ' + entry.id);
    retired.set(entry.id, entry);
    for (const id of entry.replaced_by) if (!active.has(id)) errors.push('Unknown replacement for ' + entry.id + ': ' + id);
  }
  const allocated = new Set([...active.keys(), ...retired.keys()]);
  const families = new Set([...allocated].map(id => parts(id).family));
  for (const [family, next] of Object.entries(registry.next)) {
    if (!families.has(family) || !Number.isSafeInteger(next) || next < 2 || next > 10000) {
      errors.push('Invalid next allocation: ' + family); continue;
    }
    const numbers = [...allocated].filter(id => parts(id).family === family).map(id => parts(id).number);
    if (next !== Math.max(...numbers) + 1) errors.push('Incorrect next allocation: ' + family);
    for (let n = 1; n < next; n++) if (!allocated.has(formatId(family, n))) errors.push('Missing allocation/tombstone: ' + formatId(family, n));
  }
  for (const family of families) if (!Object.hasOwn(registry.next, family)) errors.push('Missing next allocation: ' + family);

  const declarations = new Map();
  const catalog = new Map();
  if (!documents.has(registry.catalog)) errors.push('Missing screen catalog: ' + registry.catalog);
  for (const [source, text] of documents) {
    let currentScreen = null;
    let historical = false;
    for (const { line, number } of proseLines(text)) {
      const label = source + ':' + number;
      if (line.trim() === '<!-- spec-ids:history:start -->') {
        if (historical) errors.push(label + ': Nested ID history block');
        historical = true;
        continue;
      }
      if (line.trim() === '<!-- spec-ids:history:end -->') {
        if (!historical) errors.push(label + ': ID history block was not opened');
        historical = false;
        continue;
      }
      const heading = /^#{1,6}\s+((?:S\d+(?:-[TO]\d+)?|[RADC]\d+))(?=[.\s]|$)/.exec(line);
      const row = /^\|\s*((?:S\d+(?:-[TO]\d+)?|[RADC]\d+))\s*\|/.exec(line);
      if (heading && /^S\d+$/.test(heading[1])) currentScreen = heading[1];
      const declaration = heading?.[1] ?? row?.[1];
      if (declaration && !historical) {
        if (source === registry.catalog && row && /^S\d+$/.test(declaration)) {
          if (catalog.has(declaration)) errors.push(label + ': Duplicate catalog ID ' + declaration);
          catalog.set(declaration, source);
          const link = /\]\(([^)]+)\)/.exec(line);
          const target = link ? posix.normalize(posix.join(posix.dirname(source), link[1].split('#')[0])) : null;
          if (target !== active.get(declaration)) errors.push(label + ': Catalog target differs from ID owner ' + declaration);
        } else {
          if (declarations.has(declaration)) errors.push(label + ': Duplicate definition ' + declaration);
          declarations.set(declaration, source);
          if (active.get(declaration) !== source) errors.push(label + ': Definition not registered to this source: ' + declaration);
          const parent = /^(S\d+)-[TO]\d+$/.exec(declaration)?.[1];
          if (parent && (currentScreen !== parent || active.get(parent) !== source)) errors.push(label + ': Wrong screen parent for ' + declaration);
        }
      }
      for (const id of references(line)) {
        if (retired.has(id)) {
          if (!historical) errors.push(label + ': Retired ID reference ' + id);
        } else if (!active.has(id)) errors.push(label + ': Unknown ID reference ' + id);
      }
    }
    if (historical) errors.push(source + ': Unclosed ID history block');
  }
  for (const [id, source] of active) {
    if (declarations.get(id) !== source) errors.push('Missing definition in registered source: ' + id);
    const parent = /^(S\d+)-[TO]\d+$/.exec(id)?.[1];
    if (parent && active.get(parent) !== source) errors.push('Inactive or wrong parent for ' + id);
    if (/^S\d+$/.test(id)) {
      if (!catalog.has(id)) errors.push('Screen missing from catalog: ' + id);
      if (![...active.keys()].some(key => key.startsWith(id + '-T'))) errors.push('Screen has no acceptance condition: ' + id);
    }
  }
  return {
    ok: errors.length === 0,
    active: active.size,
    retired: retired.size,
    screens: [...active.keys()].filter(id => /^S\d+$/.test(id)).length,
    conditions: [...active.keys()].filter(id => /^S\d+-T\d+$/.test(id)).length,
    errors,
  };
}
