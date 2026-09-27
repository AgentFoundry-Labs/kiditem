'use client';

import { useCallback, useRef, useState } from 'react';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { friendlyError, isApiError } from '@/lib/api-error';
import { OperationStartFailure } from '@/lib/operation-start';
import { executeTargetRegistration } from './target-registration-execution';
import { newRegistrationIdempotencyKey, type RegistrationOperationRead } from './registration-operation';
import { getMallPublishAdapter } from './adapters';
import type { MallPublishAdapter, MallPublishItem, MallSendOutcome } from './mall-publish-adapter';

/**
 * 몰 등록 실행(등록 마법사 · 수집상품 화면이 같은 것을 쓴다, KID-321). 작업 하나 = 몰 하나 × 상품 묶음.
 * 상품마다 등록 대상의 등록 실행(`channels.registration`) 하나를 시작하고 결과를 기다린다(KID-364).
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
  /** 이 작업이 시작했거나 만난 등록 실행(상품마다). `reconciling`이면 화면이 확인 · 닫기를 연다. */
  operations?: RegistrationOperationRead[];
  error: string | null;
  /**
   * 실패가 서버 거절이면 그 거절의 `code`(예: 이미 등록된 계정 — `REGISTRATION_ALREADY_REGISTERED_CODE`).
   * 화면은 이 값으로 이유를 그 몰 줄에 적는다. 서버 거절이 아니면 없다.
   */
  errorCode?: string | null;
}


function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function taskStatusForOperation(operation: RegistrationOperationRead | null, outcome: MallSendOutcome): PublishTaskStatus {
  if (!operation) return outcome.ok ? 'succeeded' : 'failed';
  if (operation.state === 'confirmed' || operation.state === 'filled') return 'succeeded';
  if (operation.state === 'needs_confirmation' || operation.state === 'running') return 'reconciling';
  if (operation.state === 'cancelled') return 'cancelled';
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
): Promise<{ status: PublishTaskStatus; outcome: MallSendOutcome; operation: RegistrationOperationRead | null }> {
  const adapter = getMallPublishAdapter(task.mallKey);
  if (!adapter) throw new Error(`${task.mallName} 어댑터가 없습니다.`);
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
  const adapterValues = task.adapterValues;
  const result = await executeTargetRegistration({
    target,
    mallKey: task.mallKey,
    adapter,
    item,
    idempotencyKey: newRegistrationIdempotencyKey('publish'),
    ...(Object.keys(adapterValues).length > 0 ? { adapterValues } : {}),
  });
  return {
    status: taskStatusForOperation(result.operation, result.outcome),
    outcome: result.outcome,
    operation: result.operation,
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
          const operations: RegistrationOperationRead[] = [];
          let finalStatus: PublishTaskStatus = 'succeeded';
          let errorMessage: string | null = null;
          let errorCode: string | null = null;
          try {
            for (const item of task.items) {
              if (cancelledRef.current) {
                finalStatus = 'cancelled';
                break;
              }
              const result = await executeItem(task, item);
              itemOutcomes.push(result.outcome);
              if (result.operation) operations.push(result.operation);
              if (result.status === 'failed') {
                finalStatus = 'failed';
                // 시작 전에 막힌 실행(검증 · 폼 만들기 실패)은 예외가 아니라 결과로 온다 — 그 까닭을 작업 줄에 올린다(QA D3).
                if (!errorMessage && result.outcome.error) {
                  const text = adapter.describeError?.(result.outcome.error) ?? result.outcome.error;
                  errorMessage = friendlyError(new Error(text), `${task.mallName}에 보내지 못했습니다.`);
                }
              }
              else if (result.status === 'reconciling' && finalStatus !== 'failed') finalStatus = 'reconciling';
            }
          } catch (error) {
            finalStatus = 'failed';
            const message = toMessage(error);
            errorMessage = adapter.describeError?.(message) ?? message;
            errorCode = error instanceof OperationStartFailure
              ? error.reason
              : isApiError(error) ? error.details.reason ?? (error.code === 'UNKNOWN' ? null : error.code) : null;
          }
          const result = {
            status: finalStatus,
            outcome: itemOutcomes.length > 0 ? combineOutcomes(itemOutcomes) : null,
            error: errorMessage,
            ...(errorCode ? { errorCode } : {}),
            ...(operations.length > 0 ? { operations } : {}),
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
