import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));
assert.ok('push' in workflow.on && 'pull_request' in workflow.on);
assert.equal(workflow.permissions.contents, 'read');
assert.ok(workflow.jobs.linux.services.postgres);
assert.equal(workflow.jobs.windows['runs-on'], 'windows-2025');
const scripts = JSON.parse(await readFile('package.json', 'utf8')).scripts;
for (const job of Object.values(workflow.jobs)) {
  for (const step of job.steps) {
    if (step.run?.startsWith('npm run ')) assert.ok(scripts[step.run.slice(8).split(' ')[0]], `Unknown npm command: ${step.run}`);
    assert.ok(!/db:migrate|deploy/.test(step.run ?? ''), 'CI must not deploy or run development migration commands; integration owns isolated test migrations');
  }
}
assert.ok(workflow.jobs.windows.steps.some(step => step.run === './scripts/start-ci-postgres.ps1'));
assert.ok(workflow.jobs.windows.steps.some(step => step.run === 'npm run verify'));
console.log('Workflow YAML, commands and Linux/native Windows database verification steps passed. Only isolated integration tests execute migrations.');
