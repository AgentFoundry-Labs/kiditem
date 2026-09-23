'use client';

import { useCallback, useRef, useState } from 'react';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { executeTargetRegistration, isActiveTargetExecution } from './target-registration-execution';
import { listRegistrationTargetExecutions } from './registration-execution-api';
import { getMallPublishAdapter } from './adapters';
import type { MallPublishAdapter, MallPublishItem, MallSendOutcome } from './mall-publish-adapter';

/**
 * 몰 등록 실행(등록 마법사 · 수집상품 화면이 같은 것을 쓴다, KID-321). 작업 하나 = 몰 하나 × 상품 묶음.
 * 폼 · API 몰은 상품마다 등록 대상 실행(준비 → 시작 → 어댑터 → 결과)을 지나고, 양식 파일(`sheet`) 몰은
 * 등록 실행 없이 파일만 만든다.
 */
export type PublishTaskStatus = 'pending' | 'running' | 'reconciling' | 'succeeded' | 'failed' | 'cancelled';

export interface PublishTask {
  id: string;
  mallKey: string;
  mallName: string;
  /** Exact ChannelAccount used to freeze a target execution. Null means the mall has no configured account. */
  channelAccountId: string | null;
  items: MallPublishItem[];
  /** 이 몰의 값 묶음. 실행기가 화면 상태를 다시 읽지 않도록 작업이 들고 간다. */
  values: Record<string, string>;
  /** 실제로 편집한 값만 실행 target에 override로 보낸다. */
  adapterValues: Record<string, string>;
  status: PublishTaskStatus;
  outcome: MallSendOutcome | null;
  error: string | null;
}


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

type RegistrationTarget = Awaited<ReturnType<typeof registrationTargetApi.resolve>>;

/**
 * 어댑터가 등록 대상에 남길 이 몰 값(ADR-0020)을 실행 전에 저장한다. 등록 실행 준비가 그 값을 얼린다 —
 * 저장하지 않고 실행하면 서버는 옛 값을 얼린다. 다른 몰의 값과 이 몰의 다른 칸은 그대로 둔다.
 */
async function saveAdapterTargetInput(
  target: RegistrationTarget,
  adapter: MallPublishAdapter,
  mallKey: string,
  values: Readonly<Record<string, string>>,
): Promise<RegistrationTarget> {
  const input = adapter.adapterTargetInput?.(values);
  if (!input) return target;
  const registrationInput = target.registrationInput;
  return registrationTargetApi.update(target.id, {
    expectedVersion: target.version,
    registrationInput: {
      ...registrationInput,
      adapter: {
        ...registrationInput.adapter,
        [mallKey]: { ...(registrationInput.adapter[mallKey] ?? {}), ...input },
      },
    },
    selectedThumbnailAssetId: target.selectedThumbnailAssetId,
    selectedDetailPageRevisionId: target.selectedDetailPageRevisionId,
    selectedOptions: target.selectedOptions,
  });
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
  const resolved = await registrationTargetApi.resolve({
    salesProductId,
    channelAccountId: task.channelAccountId,
  });
  const target = await saveAdapterTargetInput(resolved, adapter, task.mallKey, task.values);
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
    /** 끝난 작업들을 돌려준다(실행 중이면 빈 배열). 화면은 이 값이나 `tasks` 로 결과를 읽는다. */
    async (queue: readonly PublishTask[]): Promise<PublishTask[]> => {
      if (runningRef.current || queue.length === 0) return [];
      const finished: PublishTask[] = [];
      runningRef.current = true;
      cancelledRef.current = false;
      setTasks(queue.map((task) => ({ ...task, status: 'pending', outcome: null, error: null })));
      setRunning(true);

      try {
        for (const task of queue) {
          if (cancelledRef.current) {
            patch(task.id, { status: 'cancelled' });
            finished.push({ ...task, status: 'cancelled' });
            continue;
          }
          const adapter = getMallPublishAdapter(task.mallKey);
          if (!adapter) {
            const error = `${task.mallName} 어댑터가 없습니다.`;
            patch(task.id, { status: 'failed', error });
            finished.push({ ...task, status: 'failed', error });
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
            const message = toMessage(error);
            errorMessage = adapter.describeError?.(message) ?? message;
          }
          const result = {
            status: finalStatus,
            outcome: itemOutcomes.length > 0 ? combineOutcomes(itemOutcomes) : null,
            error: errorMessage,
          };
          patch(task.id, result);
          finished.push({ ...task, ...result });
        }
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
      return finished;
    },
    [patch],
  );

  return { tasks, running, start, cancel, reset };
}
