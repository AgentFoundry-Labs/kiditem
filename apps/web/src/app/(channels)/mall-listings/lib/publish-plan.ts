import type {
  MallPublishAdapter,
  MallPublishItem,
  MallSendOutcome,
} from '../../_shared/mall-publish-adapter';

/**
 * 송신 계획.
 *
 * 상품 N개 × 몰 M개를 **작업 목록**으로 만든다. 업계 솔루션이 전부 이 모양이다 —
 * 화면은 N×M 을 한 번에 고르지만 실제 송신은 몰이 감당할 수 있는 크기로 쪼개
 * 순차 실행된다(사방넷도 등록은 몰 1개씩이고 예약 큐에서 합친다).
 *
 * 우리 경우 쪼개는 이유가 더 분명하다. 폼 자동채움은 브라우저 탭 하나를 점유하고
 * 최대 3분이 걸린다. 동시에 두 탭을 몰면 둘 다 깨진다.
 */

export type PublishTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface PublishTask {
  id: string;
  mallKey: string;
  mallName: string;
  items: MallPublishItem[];
  /** 이 몰의 값 묶음. 실행기가 화면 상태를 다시 읽지 않도록 작업이 들고 간다. */
  values: Record<string, string>;
  status: PublishTaskStatus;
  outcome: MallSendOutcome | null;
  error: string | null;
}

/** 몰 기준으로 막힌 상품 한 건. 계획에 들어가지 않고 이유만 보여준다. */
export interface PublishBlock {
  mallKey: string;
  mallName: string;
  candidateId: string;
  productName: string;
  reasons: string[];
}

export interface PublishPlan {
  tasks: PublishTask[];
  blocks: PublishBlock[];
  /** 실제로 보낼 (상품 × 몰) 건수. 화면의 확인 문구가 이 숫자를 쓴다. */
  sendCount: number;
}

export interface BuildPublishPlanInput {
  items: readonly MallPublishItem[];
  adapters: readonly MallPublishAdapter[];
  /** 몰키 → 그 몰의 값 묶음. */
  valuesByMall: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isFinite(size) || size <= 0) return items.length > 0 ? [[...items]] : [];
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/**
 * 계획을 만든다. 아무것도 보내지 않는다.
 *
 * 막힌 상품은 작업에서 빼고 `blocks` 로 남긴다. 반쯤 빈 폼이 열리는 것보다
 * 안 열리는 것이 낫다 — 열린 폼은 사람이 그대로 제출할 수 있다.
 */
export function buildPublishPlan(input: BuildPublishPlanInput): PublishPlan {
  const tasks: PublishTask[] = [];
  const blocks: PublishBlock[] = [];
  let sendCount = 0;

  for (const adapter of input.adapters) {
    const values = input.valuesByMall[adapter.mallKey] ?? {};
    const sendable: MallPublishItem[] = [];

    for (const item of input.items) {
      const reasons = adapter.validate(item, values);
      if (reasons.length > 0) {
        blocks.push({
          mallKey: adapter.mallKey,
          mallName: adapter.mallName,
          candidateId: item.candidateId,
          productName: item.name,
          reasons,
        });
        continue;
      }
      sendable.push(item);
    }

    sendCount += sendable.length;
    chunk(sendable, adapter.batchSize).forEach((group, index) => {
      tasks.push({
        id: `${adapter.mallKey}#${index}`,
        mallKey: adapter.mallKey,
        mallName: adapter.mallName,
        items: group,
        values: { ...values },
        status: 'pending',
        outcome: null,
        error: null,
      });
    });
  }

  return { tasks, blocks, sendCount };
}

export interface PublishRunSummary {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  /** 몰 재조회로 등록이 확인된 작업 수. 폼·엑셀 경로는 여기에 오르지 않는다. */
  confirmed: number;
  done: boolean;
}

export function summarizePublishRun(tasks: readonly PublishTask[]): PublishRunSummary {
  const count = (status: PublishTaskStatus) =>
    tasks.filter((task) => task.status === status).length;
  const pending = count('pending');
  const running = count('running');
  return {
    total: tasks.length,
    pending,
    running,
    succeeded: count('succeeded'),
    failed: count('failed'),
    cancelled: count('cancelled'),
    confirmed: tasks.filter((task) => task.outcome?.confirmed === true).length,
    done: tasks.length > 0 && pending === 0 && running === 0,
  };
}

/** 실행 후 사람이 몰 화면에서 마저 해야 하는 것. 작업별로 흩어진 것을 모은다. */
export function collectManualSteps(tasks: readonly PublishTask[]): { mallName: string; step: string }[] {
  const seen = new Set<string>();
  const steps: { mallName: string; step: string }[] = [];
  for (const task of tasks) {
    for (const step of task.outcome?.manualSteps ?? []) {
      const key = `${task.mallName}::${step}`;
      if (seen.has(key)) continue;
      seen.add(key);
      steps.push({ mallName: task.mallName, step });
    }
  }
  return steps;
}
