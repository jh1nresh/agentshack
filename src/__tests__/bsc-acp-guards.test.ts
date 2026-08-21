/**
 * Tests for bsc-acp.ts guard clauses.
 *
 * Mocks viem to test skip logic without BSC RPC.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';

const testPrivateKey = (): `0x${string}` => `0x${randomBytes(32).toString('hex')}`;

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({ readContract: vi.fn() })),
  createWalletClient: vi.fn(() => ({ writeContract: vi.fn() })),
  http: vi.fn(() => 'mock-transport'),
  parseEventLogs: vi.fn(() => []),
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: '0x046aB9D6aC4EA10C42501ad89D9a741115A76Fa9',
  })),
}));

describe('createSessionOnChain guard paths', () => {
  const originalEnv = process.env;

  const dummyParams = {
    description: 'test session',
    expiredAt: BigInt(Math.floor(Date.now() / 1000) + 86400),
    budgetUsdc: BigInt(1e18),
  };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('skips when BSC_ACP_ADDRESS is zero address', async () => {
    process.env.BSC_ACP_ADDRESS = '0x0000000000000000000000000000000000000000';
    process.env.DOJO_RELAYER_PRIVATE_KEY = testPrivateKey();
    const { createSessionOnChain } = await import('@/lib/bsc-acp');
    const result = await createSessionOnChain(dummyParams);
    expect(result.success).toBe(false);
    expect(result.error).toContain('BSC_ACP_ADDRESS');
  });

  it('skips when DOJO_RELAYER_PRIVATE_KEY not set', async () => {
    process.env.BSC_ACP_ADDRESS = '0x1C86C5cAC643325534Ac2198f55B32A7A613f9F8';
    delete process.env.DOJO_RELAYER_PRIVATE_KEY;
    const { createSessionOnChain } = await import('@/lib/bsc-acp');
    const result = await createSessionOnChain(dummyParams);
    expect(result.success).toBe(false);
    expect(result.error).toContain('DOJO_RELAYER_PRIVATE_KEY');
  });

  it('skips when BSC_EVALUATOR_ADDRESS is zero address', async () => {
    process.env.BSC_ACP_ADDRESS = '0x1C86C5cAC643325534Ac2198f55B32A7A613f9F8';
    process.env.DOJO_RELAYER_PRIVATE_KEY = testPrivateKey();
    process.env.BSC_EVALUATOR_ADDRESS = '0x0000000000000000000000000000000000000000';
    const { createSessionOnChain } = await import('@/lib/bsc-acp');
    const result = await createSessionOnChain(dummyParams);
    expect(result.success).toBe(false);
    expect(result.error).toContain('BSC_EVALUATOR_ADDRESS');
  });
});
