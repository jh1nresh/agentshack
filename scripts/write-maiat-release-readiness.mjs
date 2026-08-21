#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const policyPath = argument('--policy');
const expectedCommit = argument('--expected-commit');
const output = argument('--output');
const repository = argument('--repository');
const runId = argument('--run-id');
const runAttempt = argument('--run-attempt');

if (!policyPath || !expectedCommit || !output || !repository || !runId || !runAttempt) {
  throw new Error(
    '--policy, --expected-commit, --output, --repository, --run-id, and --run-attempt are required.',
  );
}
if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
  throw new Error('Expected commit must be a full lowercase 40-character SHA.');
}
const workflowRunAttempt = Number.parseInt(runAttempt, 10);
if (!Number.isSafeInteger(workflowRunAttempt) || workflowRunAttempt < 1) {
  throw new Error('Workflow run attempt must be a positive integer.');
}

const policy = JSON.parse(await readFile(policyPath, 'utf8'));
if (
  policy.contractVersion !== 'maiat-release-policy/v1'
  || policy.application?.requiredActiveChain !== 'bscTestnet'
  || policy.contracts?.mainnetDeploymentStatus !== 'blocked-zero-addresses'
  || policy.contracts?.expectedMainnetContractsReady !== false
) {
  throw new Error('Maiat release policy is missing an approved testnet/mainnet boundary.');
}

const receipt = {
  contractVersion: 'maiat-release-readiness/v1',
  product: 'Maiat Dojo',
  source: {
    repository,
    commit: expectedCommit,
    workflowRunId: runId,
    workflowRunAttempt,
  },
  policy,
  checks: {
    lint: 'passed',
    typecheck: 'passed',
    appTests: 'passed',
    appBuild: 'passed',
    runtimeAudit: 'passed',
    contractBuildAndSizes: 'passed',
    contractUnitRegressionAndFuzz: 'passed',
  },
  distribution: {
    appDeployment: 'awaiting-vercel',
    contractBroadcast: 'not-performed',
    chainWrite: 'not-performed',
    settlementCron: 'not-triggered',
    status: 'awaiting-human-approval',
  },
};

await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(`Wrote ${output}`);
