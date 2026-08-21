import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { reconcileSessionReceipts } from '@/lib/workflow-ledger';

function transactionClient(updateMany: ReturnType<typeof vi.fn>) {
  return {
    workflowRunReceipt: { updateMany },
  } as unknown as Prisma.TransactionClient;
}

describe('session receipt reconciliation', () => {
  it('preserves per-run refunded receipts when a session passes', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await reconcileSessionReceipts(
      transactionClient(updateMany),
      'session-1',
      'paid',
      { status: 'settled', settleTxHash: '0xsettled', error: null },
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1', settlementStatus: 'paid' },
      data: {
        anchorStatus: 'settled',
        settleTxHash: '0xsettled',
        anchorError: null,
      },
    });
  });

  it('marks every receipt refunded when the session fails', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });

    await reconcileSessionReceipts(
      transactionClient(updateMany),
      'session-1',
      'refunded',
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      data: { settlementStatus: 'refunded' },
    });
  });
});
