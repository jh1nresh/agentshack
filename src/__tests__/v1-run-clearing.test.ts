import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const tx = {
    skillCall: { create: vi.fn() },
    workflow: { findUnique: vi.fn(), update: vi.fn() },
    workflowFork: { findUnique: vi.fn() },
    workflowRunReceipt: { create: vi.fn() },
    session: { updateMany: vi.fn() },
    user: { updateMany: vi.fn(), findUnique: vi.fn() },
  };
  const prisma = {
    user: { findUnique: vi.fn() },
    agent: { findFirst: vi.fn() },
    session: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    skill: { findFirst: vi.fn() },
    skillCall: { findFirst: vi.fn() },
    workflowRunReceipt: { groupBy: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/swap-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/swap-router')>();
  return {
    ...actual,
    skillIdForSlug: () => null,
  };
});

import { POST } from '@/app/api/v1/run/route';

const workflow = {
  id: 'workflow-1',
  slug: 'test-service',
  name: 'Test Service',
  category: 'testing',
  runCount: 0,
  forkCount: 0,
  trustScore: 0,
  royaltyBps: 500,
};

const skill = {
  id: 'skill-1',
  name: 'Test Service',
  description: 'Runs a deterministic test service.',
  category: 'testing',
  tags: '',
  installs: 0,
  gatewaySlug: 'test-service',
  endpointUrl: 'https://example.com/run',
  creatorHmacSecret: null,
  pricePerCall: 1,
  skillType: 'active',
  estLatencyMs: 100,
  inputShape: 'form',
  outputShape: 'json',
  exampleInput: null,
  exampleOutput: null,
  securityScanProvider: null,
  securityRiskScore: null,
  securityRiskSeverity: null,
  securityRecommendation: null,
  securityFindingCount: null,
  securityScannedAt: null,
  workflow,
};

const session = {
  id: 'session-1',
  budgetRemaining: 5,
};

function request() {
  return new NextRequest('http://localhost/api/v1/run', {
    method: 'POST',
    headers: {
      authorization: 'Bearer dojo_sk_test',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ service: 'test-service', input: { value: 1 } }),
  });
}

function receipt(settlementStatus: 'paid' | 'refunded') {
  return {
    id: `receipt-${settlementStatus}`,
    workflowId: workflow.id,
    versionId: 'version-1',
    settlementStatus,
    anchorStatus: 'not_started',
    onchainRequestId: null,
    swapTxHash: null,
    settleTxHash: null,
    skillVersion: 1,
    lineageParentWorkflowId: null,
    lineageDepth: 0,
  };
}

describe('POST /api/v1/run evaluator-gated clearing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', creditBalance: 10 });
    mocks.prisma.agent.findFirst.mockResolvedValue({ id: 'agent-1' });
    mocks.prisma.session.findFirst.mockResolvedValue(session);
    mocks.prisma.session.findUnique.mockResolvedValue({ budgetRemaining: 4 });
    mocks.prisma.skill.findFirst.mockResolvedValue(skill);
    mocks.prisma.skillCall.findFirst.mockResolvedValue(null);
    mocks.prisma.workflowRunReceipt.groupBy.mockResolvedValue([]);
    mocks.tx.skillCall.create.mockResolvedValue({ id: 'call-1' });
    mocks.tx.workflow.findUnique.mockResolvedValue({
      ...workflow,
      creatorId: 'creator-1',
      versions: [{ id: 'version-1', version: 1 }],
    });
    mocks.tx.workflowFork.findUnique.mockResolvedValue(null);
    mocks.tx.workflow.update.mockResolvedValue(workflow);
    mocks.tx.session.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.user.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.user.findUnique.mockResolvedValue({ creditBalance: 9 });
  });

  it('charges and records a paid receipt when the evaluator passes', async () => {
    mocks.tx.workflowRunReceipt.create.mockResolvedValue(receipt('paid'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cost).toBe(1);
    expect(body.balance).toBe(9);
    expect(body.receipt).toMatchObject({
      clearing_result: 'PASS',
      settlement_status: 'paid',
      evaluator: { policy_id: 'pay-on-pass-v0', score: 1 },
      reputation_update: { workflow_id: workflow.id, score: 1 },
    });
    expect(mocks.tx.session.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.user.updateMany).toHaveBeenCalledOnce();
  });

  it('refunds without decrementing credits when the creator returns an error', async () => {
    mocks.tx.workflowRunReceipt.create.mockResolvedValue(receipt('refunded'));
    mocks.tx.user.findUnique.mockResolvedValue({ creditBalance: 10 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'creator failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.cost).toBe(0);
    expect(body.balance).toBe(10);
    expect(body.receipt).toMatchObject({
      clearing_result: 'FAIL',
      settlement_status: 'refunded',
      evaluator: {
        policy_id: 'pay-on-pass-v0',
        score: 0,
        failure_reason: 'delivery_failed',
      },
      reputation_update: { workflow_id: workflow.id, score: 0 },
    });
    expect(mocks.tx.session.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.user.updateMany).not.toHaveBeenCalled();
  });
});
