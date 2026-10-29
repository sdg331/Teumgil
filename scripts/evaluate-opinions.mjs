import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateRun, fingerprints, referenceRun, repoRoot } from './lib/opinions.mjs';

let reportPath;
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--fingerprints') {
    console.log(JSON.stringify(fingerprints(), null, 2));
  } else {
    const fixtureMode = args.length === 1 && args[0] === '--fixtures';
    if (!fixtureMode && !(args.length === 2 && args[0] === '--file')) {
      throw new Error('Usage: --fixtures | --fingerprints | --file <predictions.json>');
    }
    const reportDirectory = resolve(repoRoot, '.harness');
    mkdirSync(reportDirectory, { recursive: true });
    const filename = fixtureMode ? 'fixture-report.json' : 'output-report.json';
    reportPath = resolve(reportDirectory, filename);
    writeFileSync(reportPath, `${JSON.stringify({ outcome: 'running' })}\n`);
    let run;
    if (fixtureMode) run = referenceRun();
    else {
      const source = readFileSync(resolve(args[1]), 'utf8');
      try { run = JSON.parse(source); }
      catch { throw new Error('Predictions file contains invalid JSON.'); }
    }
    if (!fixtureMode && run?.metadata?.source === 'fixture') throw new Error('Imported outputs must identify as model, template, or manual.');
    const report = evaluateRun(run);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${report.execution}: ${report.passed}/${report.total} passed (source: ${report.source})`);
    console.log(`Report: .harness/${filename}`);
    for (const result of report.results.filter((entry) => !entry.ok)) {
      console.error(`${result.case_id}: ${result.errors.join('; ')}`);
    }
    if (report.passed !== report.total) process.exitCode = 1;
  }
} catch (error) {
  if (reportPath) {
    try { writeFileSync(reportPath, `${JSON.stringify({ outcome: 'rejected', errors: [error.message] }, null, 2)}\n`); }
    catch { console.error('Could not write the rejected evaluation report.'); }
  }
  console.error(error.message);
  process.exitCode = 1;
}
