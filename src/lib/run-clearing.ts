import type { EvalResult } from '@/lib/session-evaluator';

export const RUN_CLEARING_POLICY_ID = 'pay-on-pass-v0';
export const SESSION_PASS_THRESHOLD = 80;

export type RunClearingFailureReason =
  | 'delivery_failed'
  | 'invalid_format'
  | 'sla_missed'
  | 'evaluator_failed';

export type RunClearingDecision = {
  policyId: typeof RUN_CLEARING_POLICY_ID;
  result: 'PASS' | 'FAIL';
  settlementStatus: 'paid' | 'refunded';
  shouldCharge: boolean;
  costUsdc: number;
  failureReason: RunClearingFailureReason | null;
};

export function decideRunClearing(
  evaluation: Pick<EvalResult, 'delivered' | 'validFormat' | 'withinSla' | 'score'>,
  quotedPriceUsdc: number,
): RunClearingDecision {
  const passed =
    evaluation.delivered
    && evaluation.validFormat
    && evaluation.withinSla
    && evaluation.score > 0;

  let failureReason: RunClearingFailureReason | null = null;
  if (!passed) {
    if (!evaluation.delivered) failureReason = 'delivery_failed';
    else if (!evaluation.validFormat) failureReason = 'invalid_format';
    else if (!evaluation.withinSla) failureReason = 'sla_missed';
    else failureReason = 'evaluator_failed';
  }

  return {
    policyId: RUN_CLEARING_POLICY_ID,
    result: passed ? 'PASS' : 'FAIL',
    settlementStatus: passed ? 'paid' : 'refunded',
    shouldCharge: passed,
    costUsdc: passed ? quotedPriceUsdc : 0,
    failureReason,
  };
}

export function aggregateSessionClearing(
  calls: Array<{ score: number; costUsdc: number }>,
) {
  const settleableCalls = calls.filter(
    (call) => call.score > 0 || call.costUsdc > 0,
  );
  const passedCalls = settleableCalls.filter((call) => call.score > 0.5).length;
  const totalCalls = settleableCalls.length;
  const passRate = totalCalls > 0
    ? Math.round((passedCalls / totalCalls) * 100)
    : 0;

  return {
    recordedCalls: calls.length,
    totalCalls,
    passedCalls,
    passRate,
    isPASS: totalCalls > 0 && passRate >= SESSION_PASS_THRESHOLD,
  };
}
