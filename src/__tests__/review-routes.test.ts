import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    workflowRunReceipt: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    agent: {
      findMany: vi.fn(),
    },
    skill: {
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/privy-server', () => ({
  verifyPrivyAuth: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { verifyPrivyAuth } from '@/lib/privy-server';

// Import route handlers
import { GET as getReviews } from '@/app/api/skills/[id]/reviews/route';
import { POST as postReview } from '@/app/api/skills/[id]/review/route';
import { GET as getSessions } from '@/app/api/sessions/route';

function makeRequest(url: string, opts: RequestInit = {}) {
  const req = new Request(url, opts);
  return req as any; // NextRequest-compatible for our tests
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/skills/[id]/reviews', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns reviews for a skill', async () => {
    (prisma.review.findMany as any).mockResolvedValue([
      { id: 'r1', rating: 5, comment: 'Great', user: { id: 'u1' }, session: null },
    ]);

    const res = await getReviews(
      makeRequest('http://localhost/api/skills/sk1/reviews'),
      routeParams('sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].rating).toBe(5);
  });

  it('returns empty array for skill with no reviews', async () => {
    (prisma.review.findMany as any).mockResolvedValue([]);

    const res = await getReviews(
      makeRequest('http://localhost/api/skills/sk1/reviews'),
      routeParams('sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });
});

describe('POST /api/skills/[id]/review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Enable dev mode (skip auth)
    process.env.DOJO_SKIP_PRIVY_AUTH = 'true';
    (process.env as Record<string, string>).NODE_ENV = 'test';
  });

  it('rejects missing fields (no rating/comment)', async () => {
    const res = await postReview(
      makeRequest('http://localhost/api/skills/sk1/review', {
        method: 'POST',
        body: JSON.stringify({ sessionId: 'sess1', userId: 'u1' }),
      }),
      routeParams('sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/Missing fields/);
  });

  it('rejects missing sessionId', async () => {
    const res = await postReview(
      makeRequest('http://localhost/api/skills/sk1/review', {
        method: 'POST',
        body: JSON.stringify({ rating: 5, comment: 'Nice', userId: 'u1' }),
      }),
      routeParams('sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/sessionId required/);
  });

  it('rejects missing userId in dev mode', async () => {
    const res = await postReview(
      makeRequest('http://localhost/api/skills/sk1/review', {
        method: 'POST',
        body: JSON.stringify({ rating: 5, comment: 'Nice', sessionId: 'sess1' }),
      }),
      routeParams('sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/userId required/);
  });

  it('returns 403 if session not found', async () => {
    (prisma.session.findUnique as any).mockResolvedValue(null);

    const res = await postReview(
      makeRequest('http://localhost/api/skills/sk1/review', {
        method: 'POST',
        body: JSON.stringify({ rating: 5, comment: 'Nice', sessionId: 'sess1', userId: 'u1' }),
      }),
      routeParams('sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toMatch(/No settled session/);
  });

  it('returns 403 if session not settled', async () => {
    (prisma.session.findUnique as any).mockResolvedValue({
      id: 'sess1',
      skillId: 'sk1',
      status: 'active',
      agent: { ownerId: 'u1' },
    });

    const res = await postReview(
      makeRequest('http://localhost/api/skills/sk1/review', {
        method: 'POST',
        body: JSON.stringify({ rating: 5, comment: 'Nice', sessionId: 'sess1', userId: 'u1' }),
      }),
      routeParams('sk1')
    );

    expect(res.status).toBe(403);
  });

  it('returns 409 for duplicate review', async () => {
    (prisma.session.findUnique as any).mockResolvedValue({
      id: 'sess1',
      skillId: 'sk1',
      status: 'settled',
      agent: { ownerId: 'u1' },
    });
    (prisma.workflowRunReceipt.findFirst as any).mockResolvedValue({ id: 'receipt1' });
    (prisma.review.findUnique as any).mockResolvedValue({ id: 'existing' });

    const res = await postReview(
      makeRequest('http://localhost/api/skills/sk1/review', {
        method: 'POST',
        body: JSON.stringify({ rating: 5, comment: 'Nice', sessionId: 'sess1', userId: 'u1' }),
      }),
      routeParams('sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/Already reviewed/);
  });

  it('returns 403 if settled session has no final receipt', async () => {
    (prisma.session.findUnique as any).mockResolvedValue({
      id: 'sess1',
      skillId: 'sk1',
      status: 'settled',
      agent: { ownerId: 'u1' },
    });
    (prisma.workflowRunReceipt.findFirst as any).mockResolvedValue(null);

    const res = await postReview(
      makeRequest('http://localhost/api/skills/sk1/review', {
        method: 'POST',
        body: JSON.stringify({ rating: 5, comment: 'Nice', sessionId: 'sess1', userId: 'u1' }),
      }),
      routeParams('sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toMatch(/No final receipt/);
  });

  it('creates review successfully with settled session', async () => {
    (prisma.session.findUnique as any).mockResolvedValue({
      id: 'sess1',
      skillId: 'sk1',
      status: 'settled',
      agent: { ownerId: 'u1' },
    });
    (prisma.workflowRunReceipt.findFirst as any).mockResolvedValue({ id: 'receipt1' });
    (prisma.review.findUnique as any).mockResolvedValue(null);
    (prisma.review.create as any).mockResolvedValue({
      id: 'r1',
      rating: 5,
      comment: 'Excellent',
      userId: 'u1',
      skillId: 'sk1',
      sessionId: 'sess1',
      user: { id: 'u1' },
    });
    (prisma.review.aggregate as any).mockResolvedValue({ _avg: { rating: 4.5 } });
    (prisma.skill.update as any).mockResolvedValue({});

    const res = await postReview(
      makeRequest('http://localhost/api/skills/sk1/review', {
        method: 'POST',
        body: JSON.stringify({ rating: 5, comment: 'Excellent', sessionId: 'sess1', userId: 'u1' }),
      }),
      routeParams('sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.rating).toBe(5);
    expect(prisma.skill.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { rating: 4.5 } })
    );
  });
});

describe('GET /api/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DOJO_SKIP_PRIVY_AUTH = 'true';
    (process.env as Record<string, string>).NODE_ENV = 'test';
  });

  it('rejects missing privyId', async () => {
    const res = await getSessions(
      makeRequest('http://localhost/api/sessions?skillId=sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/privyId.*required/);
  });

  it('rejects missing skillId', async () => {
    const res = await getSessions(
      makeRequest('http://localhost/api/sessions?privyId=p1')
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/skillId.*required/);
  });

  it('returns empty sessions for unknown user', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);

    const res = await getSessions(
      makeRequest('http://localhost/api/sessions?privyId=p1&skillId=sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sessions).toEqual([]);
  });

  it('returns settled sessions for valid user', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', privyId: 'p1' });
    (prisma.agent.findMany as any).mockResolvedValue([{ id: 'a1' }]);
    (prisma.session.findMany as any).mockResolvedValue([
      {
        id: 'sess1',
        callCount: 3,
        status: 'settled',
        settledAt: new Date('2026-04-14'),
        workflowRunReceipts: [{ id: 'receipt1', settlementStatus: 'paid' }],
      },
    ]);

    const res = await getSessions(
      makeRequest('http://localhost/api/sessions?privyId=p1&skillId=sk1')
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].status).toBe('settled');
    expect(data.sessions[0].receiptId).toBe('receipt1');
    expect(data.userId).toBe('u1');
  });
});
