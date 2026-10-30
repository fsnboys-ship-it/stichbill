import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));
assert.ok('push' in workflow.on && 'pull_request' in workflow.on);
assert.equal(workflow.permissions.contents, 'read');
assert.ok(workflow.jobs.linux.services.postgres);
assert.equal(workflow.jobs.windows['runs-on'], 'windows-latest');
const scripts = JSON.parse(await readFile('package.json', 'utf8')).scripts;
for (const job of Object.values(workflow.jobs)) {
  for (const step of job.steps) {
    if (step.run?.startsWith('npm run ')) assert.ok(scripts[step.run.slice(8)], `Unknown npm command: ${step.run}`);
    assert.ok(!/db:migrate|deploy/.test(step.run ?? ''), 'CI must not migrate or deploy');
  }
}
console.log('Workflow YAML, npm command references, Linux/Windows jobs and no-migration/deployment checks passed. GitHub execution validates runner behaviour.');
