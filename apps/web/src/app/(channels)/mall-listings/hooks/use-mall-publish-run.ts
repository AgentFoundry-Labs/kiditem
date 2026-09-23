'use client';

import { useCallback, useRef, useState } from 'react';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { executeTargetRegistration, isActiveTargetExecution } from '../../_shared/target-registration-execution';
import { listRegistrationTargetExecutions } from '../../_shared/registration-execution-api';
import { getMallPublishAdapter } from '../../_shared/adapters';
import type { MallPublishItem, MallSendOutcome } from '../../_shared/mall-publish-adapter';
import type { PublishTask, PublishTaskStatus } from '../lib/publish-plan';

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  return cryptoApi?.randomUUID?.() ?? `publish-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function taskStatusForExecution(status: string): PublishTaskStatus {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'prepared' || status === 'executing' || status === 'reconciling') return 'reconciling';
  if (status === 'cancelled') return 'cancelled';
  return 'failed';
}

function combineOutcomes(outcomes: readonly MallSendOutcome[]): MallSendOutcome {
  const unique = (values: readonly string[]) => [...new Set(values)];
  const accepted = outcomes.length > 0 && outcomes.every((outcome) => outcome.accepted === true)
    ? true
    : outcomes.some((outcome) => outcome.accepted === false) ? false : null;
  return {
    ok: outcomes.length > 0 && outcomes.every((outcome) => outcome.ok),
    confirmed: outcomes.length > 0 && outcomes.every((outcome) => outcome.confirmed),
    ...(outcomes.some((outcome) => outcome.submitted === true) ? { submitted: true } : {}),
    ...(accepted !== null ? { accepted } : {}),
    manualSteps: unique(outcomes.flatMap((outcome) => outcome.manualSteps)),
    warnings: unique(outcomes.flatMap((outcome) => outcome.warnings)),
    ...(outcomes.find((outcome) => outcome.error)?.error
      ? { error: outcomes.find((outcome) => outcome.error)?.error }
      : {}),
  };
}

function latestActive(history: Awaited<ReturnType<typeof listRegistrationTargetExecutions>>) {
  return [...history]
    .sort((left, right) => {
      const time = (value: typeof left.createdAt) => value instanceof Date ? value.getTime() : Date.parse(value ?? '');
      return time(right.createdAt) - time(left.createdAt);
    })
    .find(isActiveTargetExecution);
}

async function executeItem(
  task: PublishTask,
  item: MallPublishItem,
): Promise<{ status: PublishTaskStatus; outcome: MallSendOutcome }> {
  const adapter = getMallPublishAdapter(task.mallKey);
  if (!adapter) throw new Error(`${task.mallName} 어댑터가 없습니다.`);

  // A `sheet` delivery only creates a file for the operator. It has no selected
  // account or provider submit, so it stays a grouped, ephemeral run.
  if (adapter.mode === 'sheet') {
    const outcome = await adapter.send({ items: [item], values: task.values });
    return { status: outcome.ok ? 'succeeded' : 'failed', outcome };
  }

  if (!task.channelAccountId) throw new Error(`${task.mallName} 계정 식별자를 확인하지 못했습니다.`);
  // 수집 시점부터 판매상품 초안이 있다(ADR-0022) — 만들 것 없이 후보가 이미 아는
  // salesProductId 를 그대로 쓴다. 상품 × 몰 계정당 등록 설정은 하나뿐이라
  // (부분 유일키, 사용자 결정 01:12) resolve 는 고를 것 없이 그 하나를 연다.
  const salesProductId = item.source === 'candidate' ? item.salesProductId : item.candidateId;
  if (!salesProductId) {
    throw new Error('이 수집상품에 연결된 판매상품 초안이 없습니다.');
  }
  const target = await registrationTargetApi.resolve({
    salesProductId,
    channelAccountId: task.channelAccountId,
  });
  const history = await listRegistrationTargetExecutions(target.id);
  const activeExecution = latestActive(history);
  const adapterValues = task.adapterValues;
  const result = await executeTargetRegistration({
    targetId: target.id,
    expectedVersion: target.version,
    channelAccountId: task.channelAccountId,
    mallKey: task.mallKey,
    adapter,
    ...(activeExecution ? { existingExecution: activeExecution } : { idempotencyKey: newIdempotencyKey() }),
    ...(Object.keys(adapterValues).length > 0 ? { adapterValues } : {}),
  });
  return {
    status: taskStatusForExecution(result.execution.status),
    outcome: result.outcome,
  };
}

/** Registration runs stay serial because form adapters share the user's browser tab. */
export function useMallPublishRun() {
  const [tasks, setTasks] = useState<PublishTask[]>([]);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setTasks([]);
    setRunning(false);
    runningRef.current = false;
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const patch = useCallback((id: string, next: Partial<PublishTask>) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...next } : task)));
  }, []);

  const start = useCallback(
    async (queue: readonly PublishTask[]) => {
      if (runningRef.current || queue.length === 0) return;
      runningRef.current = true;
      cancelledRef.current = false;
      setTasks(queue.map((task) => ({ ...task, status: 'pending', outcome: null, error: null })));
      setRunning(true);

      try {
        for (const task of queue) {
          if (cancelledRef.current) {
            patch(task.id, { status: 'cancelled' });
            continue;
          }
          const adapter = getMallPublishAdapter(task.mallKey);
          if (!adapter) {
            patch(task.id, { status: 'failed', error: `${task.mallName} 어댑터가 없습니다.` });
            continue;
          }
          patch(task.id, { status: 'running', error: null });
          const itemOutcomes: MallSendOutcome[] = [];
          let finalStatus: PublishTaskStatus = 'succeeded';
          let errorMessage: string | null = null;
          try {
            if (adapter.mode === 'sheet') {
              const outcome = await adapter.send({ items: task.items, values: task.values });
              itemOutcomes.push(outcome);
              finalStatus = outcome.ok ? 'succeeded' : 'failed';
            } else {
              for (const item of task.items) {
                if (cancelledRef.current) {
                  finalStatus = 'cancelled';
                  break;
                }
                const result = await executeItem(task, item);
                itemOutcomes.push(result.outcome);
                if (result.status === 'failed') finalStatus = 'failed';
                else if (result.status === 'reconciling' && finalStatus !== 'failed') finalStatus = 'reconciling';
              }
            }
          } catch (error) {
            finalStatus = 'failed';
            errorMessage = toMessage(error);
          }
          patch(task.id, {
            status: finalStatus,
            outcome: itemOutcomes.length > 0 ? combineOutcomes(itemOutcomes) : null,
            error: errorMessage,
          });
        }
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
    },
    [patch],
  );

  return { tasks, running, start, cancel, reset };
}
