import { afterEach, describe, expect, it } from 'vitest';
import policy from '../../config/maiat-release-policy.json';
import { GET } from '@/app/api/health/route';
import { ACTIVE_CHAIN } from '@/lib/contracts';
import {
  REQUIRED_MAINNET_CONTRACTS,
  mainnetContractsReady,
} from '@/lib/release-readiness';

const previousRevision = process.env.VERCEL_GIT_COMMIT_SHA;

afterEach(() => {
  if (previousRevision === undefined) {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  } else {
    process.env.VERCEL_GIT_COMMIT_SHA = previousRevision;
  }
});
describe('Maiat release readiness', () => {
  it('keeps the structured release policy aligned with contract configuration', () => {
    expect(policy.application.requiredActiveChain).toBe(ACTIVE_CHAIN);
    expect(policy.contracts.requiredMainnetAddresses).toEqual(REQUIRED_MAINNET_CONTRACTS);
    expect(policy.contracts.expectedMainnetContractsReady).toBe(mainnetContractsReady());
    expect(policy.contracts.mainnetDeploymentStatus).toBe('blocked-zero-addresses');
  });

  it('exposes commit-aware read-only deployment state', async () => {
    const revision = '0123456789abcdef0123456789abcdef01234567';
    process.env.VERCEL_GIT_COMMIT_SHA = revision;

    const response = await GET();
    const payload = await response.json();

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload).toEqual({
      ok: true,
      product: 'Maiat Dojo',
      revision,
      activeChain: 'bscTestnet',
      mainnetContractsReady: false,
    });
  });
});
