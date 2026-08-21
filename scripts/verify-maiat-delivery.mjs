#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function positiveInteger(value, fallback) {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got ${value}.`);
  }
  return parsed;
}

const policyPath = argument('--policy');
const expectedCommit = argument('--expected-commit');
const output = argument('--output');
const attempts = positiveInteger(argument('--attempts'), 20);
const intervalMs = positiveInteger(argument('--interval-ms'), 15_000);

if (!policyPath || !expectedCommit || !output) {
  throw new Error('--policy, --expected-commit, and --output are required.');
}
if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
  throw new Error('Expected commit must be a full lowercase 40-character SHA.');
}

const policy = JSON.parse(await readFile(policyPath, 'utf8'));
const productionUrl = policy.productionUrl;
const expectedChain = policy.application?.requiredActiveChain;
const expectedMainnetReady = policy.contracts?.expectedMainnetContractsReady;
const isSecureProductionUrl = /^https:\/\/[a-z0-9.-]+$/i.test(productionUrl);
const isLoopbackTestUrl = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/i.test(
  productionUrl,
);
if (
  policy.contractVersion !== 'maiat-release-policy/v1'
  || (!isSecureProductionUrl && !isLoopbackTestUrl)
  || typeof expectedChain !== 'string'
  || typeof expectedMainnetReady !== 'boolean'
) {
  throw new Error('Maiat release policy is invalid.');
}

const healthUrl = new URL('/api/health', productionUrl).toString();
let lastObservation = null;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(healthUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json();
    lastObservation = {
      status: response.status,
      ok: payload?.ok === true,
      product: payload?.product ?? null,
      revision: payload?.revision ?? null,
      activeChain: payload?.activeChain ?? null,
      mainnetContractsReady: payload?.mainnetContractsReady ?? null,
    };

    if (
      response.ok
      && lastObservation.ok
      && lastObservation.product === 'Maiat Dojo'
      && lastObservation.revision === expectedCommit
      && lastObservation.activeChain === expectedChain
      && lastObservation.mainnetContractsReady === expectedMainnetReady
    ) {
      const receipt = {
        contractVersion: 'maiat-delivery-receipt/v1',
        product: 'Maiat Dojo',
        expectedCommit,
        observedCommit: lastObservation.revision,
        productionUrl,
        activeChain: lastObservation.activeChain,
        mainnetContractsReady: lastObservation.mainnetContractsReady,
        attempts: attempt,
        checks: {
          serviceIdentity: 'passed',
          exactRevision: 'passed',
          releasePolicy: 'passed',
          databaseMutation: 'not-performed',
          chainRead: 'not-performed',
          chainWrite: 'not-performed',
          settlementCron: 'not-triggered',
        },
        status: 'verified',
      };
      await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
      console.log(`Maiat delivery verified at ${expectedCommit}.`);
      process.exit(0);
    }
  } catch (error) {
    lastObservation = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  console.log(
    `Attempt ${attempt}/${attempts}: production has not converged to ${expectedCommit}.`,
  );
  if (attempt < attempts) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

throw new Error(
  `Maiat production delivery did not converge: ${JSON.stringify(lastObservation)}`,
);
