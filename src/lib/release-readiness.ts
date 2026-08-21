import { ACTIVE_CHAIN, CONTRACTS } from '@/lib/contracts';

export const REQUIRED_MAINNET_CONTRACTS = [
  'agenticCommerceHooked',
  'trustBasedEvaluator',
  'evaluatorRegistry',
  'dojoTrustScore',
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function mainnetContractsReady() {
  return REQUIRED_MAINNET_CONTRACTS.every(
    (name) => CONTRACTS.bsc[name].toLowerCase() !== ZERO_ADDRESS,
  );
}
export function deploymentRevision(env: NodeJS.ProcessEnv = process.env) {
  const candidates = [
    env.VERCEL_GIT_COMMIT_SHA,
    env.RAILWAY_GIT_COMMIT_SHA,
    env.SOURCE_VERSION,
    env.GIT_COMMIT_SHA,
  ];
  const revision = candidates.find(
    (candidate) => candidate && /^[0-9a-f]{40}$/i.test(candidate),
  );
  return revision?.toLowerCase() ?? null;
}

export function releaseRuntimeState() {
  return {
    activeChain: ACTIVE_CHAIN,
    mainnetContractsReady: mainnetContractsReady(),
  };
}
