'use client';

import { useCallback, useRef, useState } from 'react';
import { getMallPublishAdapter } from '../../_shared/adapters';
import type { PublishTask } from '../lib/publish-plan';

/**
 * 송신 실행기.
 *
 * 작업을 **한 번에 하나씩** 돌린다. 폼 자동채움은 브라우저 탭을 열어 이미지를
 * 올리고 계단식 분류를 기다리므로, 두 개를 동시에 돌리면 서로의 탭을 밟는다.
 * 동시성은 여기서 아낄 자원이 아니다 — 사람이 지켜보는 화면 하나가 자원이다.
 *
 * 작업 하나가 실패해도 멈추지 않는다. 몰 하나의 로그인이 풀렸다고 나머지 몰까지
 * 못 보내는 것은 운영에서 더 나쁘다. 실패는 그 작업에만 남는다.
 *
 * 어댑터의 현재 결과는 작업 목록에만 남긴다. 어떤 어댑터도 계정에 제출하지 않는다 — 폼을
 * 채우거나 엑셀을 만들 뿐이고 제출은 사람이 한다(ADR-0014). 어댑터가 실제로 제출하게
 * 되는 날에는 그 경로가 등록 실행 울타리(`../../_shared/registration-execution-api.ts`)를
 * 지나야 한다.
 */

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useMallPublishRun() {
  const [tasks, setTasks] = useState<PublishTask[]>([]);
  const [running, setRunning] = useState(false);
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setTasks([]);
    setRunning(false);
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const patch = useCallback((id: string, next: Partial<PublishTask>) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...next } : task)));
  }, []);

  const start = useCallback(
    async (queue: readonly PublishTask[]) => {
      if (running || queue.length === 0) return;
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
          try {
            const outcome = await adapter.send({ items: task.items, values: task.values });
            patch(task.id, {
              status: outcome.ok ? 'succeeded' : 'failed',
              outcome,
              error: outcome.error ?? null,
            });
          } catch (error) {
            patch(task.id, { status: 'failed', error: toMessage(error) });
          }
        }
      } finally {
        setRunning(false);
      }
    },
    [patch, running],
  );

  return { tasks, running, start, cancel, reset };
}
