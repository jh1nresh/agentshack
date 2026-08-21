import { describe, expect, it } from 'vitest';
import {
  aggregateSessionClearing,
  decideRunClearing,
  RUN_CLEARING_POLICY_ID,
} from '@/lib/run-clearing';

describe('pay-on-pass run clearing', () => {
  it('charges a passing evaluated run', () => {
    expect(decideRunClearing({
      delivered: true,
      validFormat: true,
      withinSla: true,
      score: 1,
    }, 0.25)).toEqual({
      policyId: RUN_CLEARING_POLICY_ID,
      result: 'PASS',
      settlementStatus: 'paid',
      shouldCharge: true,
      costUsdc: 0.25,
      failureReason: null,
    });
  });

  it.each([
    [{ delivered: false, validFormat: false, withinSla: false, score: 0 }, 'delivery_failed'],
    [{ delivered: true, validFormat: false, withinSla: true, score: 0 }, 'invalid_format'],
    [{ delivered: true, validFormat: true, withinSla: false, score: 0 }, 'sla_missed'],
    [{ delivered: true, validFormat: true, withinSla: true, score: 0 }, 'evaluator_failed'],
  ] as const)('refunds a failed evaluated run: %s', (evaluation, failureReason) => {
    expect(decideRunClearing(evaluation, 0.25)).toEqual({
      policyId: RUN_CLEARING_POLICY_ID,
      result: 'FAIL',
      settlementStatus: 'refunded',
      shouldCharge: false,
      costUsdc: 0,
      failureReason,
    });
  });

  it('records a free passing run as paid without inventing a charge', () => {
    const decision = decideRunClearing({
      delivered: true,
      validFormat: true,
      withinSla: true,
      score: 1,
    }, 0);

    expect(decision.settlementStatus).toBe('paid');
    expect(decision.shouldCharge).toBe(true);
    expect(decision.costUsdc).toBe(0);
  });

  it('excludes refunded failures from session settlement aggregation', () => {
    expect(aggregateSessionClearing([
      { score: 1, costUsdc: 0.25 },
      { score: 0, costUsdc: 0 },
    ])).toEqual({
      recordedCalls: 2,
      totalCalls: 1,
      passedCalls: 1,
      passRate: 100,
      isPASS: true,
    });
  });

  it('keeps free passing runs in session settlement aggregation', () => {
    expect(aggregateSessionClearing([{ score: 1, costUsdc: 0 }])).toMatchObject({
      totalCalls: 1,
      passRate: 100,
      isPASS: true,
    });
  });

  it('keeps charged legacy failures visible to session settlement', () => {
    expect(aggregateSessionClearing([
      { score: 1, costUsdc: 0.25 },
      { score: 0, costUsdc: 0.25 },
    ])).toMatchObject({
      totalCalls: 2,
      passedCalls: 1,
      passRate: 50,
      isPASS: false,
    });
  });
});
