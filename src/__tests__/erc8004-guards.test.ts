/**
 * Tests for erc8004.ts guard clauses and utility functions.
 *
 * Mocks viem to test logic without BSC RPC.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';

const testPrivateKey = (): `0x${string}` => `0x${randomBytes(32).toString('hex')}`;

// Mock viem before importing the module under test
vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({ readContract: vi.fn(), getBalance: vi.fn() })),
  createWalletClient: vi.fn(() => ({ writeContract: vi.fn() })),
  http: vi.fn(() => 'mock-transport'),
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: '0x046aB9D6aC4EA10C42501ad89D9a741115A76Fa9',
  })),
}));

describe('getBscConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to testnet RPC when BSC_RPC_URL not set', async () => {
    delete process.env.BSC_RPC_URL;
    const { getBscConfig } = await import('@/lib/erc8004');
    const config = getBscConfig();
    expect(config.rpcUrl).toContain('prebsc');
    expect(config.isTestnet).toBe(true);
  });

  it('detects mainnet from BSC_RPC_URL', async () => {
    process.env.BSC_RPC_URL = 'https://bsc-dataseed.binance.org';
    const { getBscConfig } = await import('@/lib/erc8004');
    const config = getBscConfig();
    expect(config.isTestnet).toBe(false);
    expect(config.chain.id).toBe(56);
  });

  it('detects testnet from URL containing "testnet"', async () => {
    process.env.BSC_RPC_URL = 'https://data-seed-prebsc-1-s1.binance.org:8545';
    const { getBscConfig } = await import('@/lib/erc8004');
    const config = getBscConfig();
    expect(config.isTestnet).toBe(true);
    expect(config.chain.id).toBe(97);
  });

  it('reads ERC8004_ADDRESS from env', async () => {
    process.env.ERC8004_ADDRESS = '0xdeadbeef00000000000000000000000000000001';
    const { getBscConfig } = await import('@/lib/erc8004');
    const config = getBscConfig();
    expect(config.contractAddress).toBe('0xdeadbeef00000000000000000000000000000001');
  });

  it('returns undefined privateKey when DOJO_RELAYER_PRIVATE_KEY not set', async () => {
    delete process.env.DOJO_RELAYER_PRIVATE_KEY;
    const { getBscConfig } = await import('@/lib/erc8004');
    const config = getBscConfig();
    expect(config.privateKey).toBeUndefined();
  });
});

describe('createBscWalletClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when DOJO_RELAYER_PRIVATE_KEY not set', async () => {
    delete process.env.DOJO_RELAYER_PRIVATE_KEY;
    const { createBscWalletClient } = await import('@/lib/erc8004');
    expect(() => createBscWalletClient()).toThrow('DOJO_RELAYER_PRIVATE_KEY not configured');
  });

  it('returns a client when key is set', async () => {
    process.env.DOJO_RELAYER_PRIVATE_KEY = testPrivateKey();
    const { createBscWalletClient } = await import('@/lib/erc8004');
    const client = createBscWalletClient();
    expect(client).toBeDefined();
    expect(client.writeContract).toBeDefined();
  });
});

describe('withRelayerLock', () => {
  it('serializes concurrent calls', async () => {
    const { withRelayerLock } = await import('@/lib/erc8004');
    const order: number[] = [];

    const task1 = withRelayerLock(async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
      return 'a';
    });

    const task2 = withRelayerLock(async () => {
      order.push(2);
      return 'b';
    });

    const [r1, r2] = await Promise.all([task1, task2]);
    expect(r1).toBe('a');
    expect(r2).toBe('b');
    // task1 must finish before task2 starts
    expect(order).toEqual([1, 2]);
  });

  it('releases lock even when fn throws', async () => {
    const { withRelayerLock } = await import('@/lib/erc8004');

    const failing = withRelayerLock(async () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');

    // Next call should still work (lock released)
    const result = await withRelayerLock(async () => 'ok');
    expect(result).toBe('ok');
  });
});

describe('mintIdentityFor', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns error when DOJO_RELAYER_PRIVATE_KEY not set', async () => {
    delete process.env.DOJO_RELAYER_PRIVATE_KEY;
    const { mintIdentityFor } = await import('@/lib/erc8004');
    const result = await mintIdentityFor('0x0000000000000000000000000000000000000001');
    expect(result.success).toBe(false);
    expect(result.error).toContain('DOJO_RELAYER_PRIVATE_KEY');
  });
});
