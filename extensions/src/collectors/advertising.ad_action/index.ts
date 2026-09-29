import {
  AD_ACTION_EVIDENCE_CHUNK_KIND,
  AD_ACTION_KIND,
  AdActionPlanSchema,
  type AdActionEvidence,
  type AdActionPlan,
  type AdActionResult,
} from '@kiditem/shared/advertising-operations';
import { RuntimeError } from '../../core/errors';
import type { CollectFinish, CollectedChunk, Collector } from '../collector';
import { registerCollector } from '../index';

/**
 * `advertising.ad_action`(KID-386) — 서버가 승인 때 준비해 둔(`prepared`) 광고 액션 하나를 광고센터에 적용한다. 팝업 버튼이
 * claim으로 받아 runner가 돌린다(`runClaimed`). 지금 실행되는 유형은 `create_campaign` 하나다.
 *
 * 이 실행은 `resource:ad-action:<actionId>` 잠금만 쥔다 — 광고센터 계정을 독점하지 않으므로 보고서 수집이 같은 광고센터를
 * 동시에 쓸 수 있다. 사이트는 제 탭을 열어 쓰고, 한 번에 하나씩 도는 것은 팝업 루프가 지킨다.
 *
 * 순서: 업체코드 대조(보고서 수집과 같은 규칙) → 캠페인 목록에서 같은 이름을 찾는다(있으면 만들지 않는다 — 옛 roster 확인)
 * → 등록 → 증거 청크 1개 → result. 번호를 못 읽으면 목록을 한 번 더 읽어 이름으로 찾고, 그래도 없으면 `uncertain`.
 * 사이트는 [완료]를 누르기 전 실패만 던진다 — 그 실패는 실패 finish에 `not_attempted`로 싣는다(`failureResult`).
 */
export interface AdActionSite {
  readVendorId(): Promise<string>;
  listCampaigns(page: number): Promise<unknown[]>;
  createCampaign(
    input: { name: string; adGroupName?: string; productIds: string[]; dailyBudget: number; targetRoas: number | null },
    options?: { signal?: AbortSignal; onFilled?(): Promise<void> },
  ): Promise<{ campaignId: string | null; message: string | null; url: string | null }>;
  /** 실행 끝(성공·실패·중단 모두)에 한 번 — 사이트가 연 탭을 넘기거나 닫는다. */
  release(outcome: { error?: unknown }): Promise<void>;
}

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
const ADVERTISING_IDENTITY_MISMATCH = 'ADVERTISING_IDENTITY_MISMATCH' as const;
/** `sites/ad-center`의 tetris 캠페인 목록 한 쪽 크기(`AD_CENTER_PAGE_SIZE`). */
const CAMPAIGN_PAGE_SIZE = 500;
const MAX_CAMPAIGN_PAGES = 20;
/** 광고센터 [완료]를 눌렀다는 progress 표식. */
const PRESSED_PHASE = 'pressed';
const EXISTING_MESSAGE = '같은 이름의 캠페인이 이미 있어 새로 만들지 않았습니다.';

export const adActionCollector: Collector<AdActionPlan, AdActionResult, AdActionSite> = {
  kind: AD_ACTION_KIND,
  site: 'ad-center',
  async *collect(rawPlan, site, { signal, report }) {
    const parsed = AdActionPlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '광고 액션 실행 계획이 올바르지 않습니다.', { kind: AD_ACTION_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '광고센터 사이트를 쓸 수 없습니다.', { kind: AD_ACTION_KIND });
    const plan = parsed.data;
    let failure: unknown = null;
    try {
      return yield* apply(plan, site, signal, report);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      await site.release({ error: failure }).catch(() => undefined);
    }
  },

  /** 누르기 전 실패는 `not_attempted`, [완료]를 누른 뒤 실패는 `uncertain`(사람이 광고센터에서 확인). */
  failureResult(rawPlan, error, { progress }) {
    const parsed = AdActionPlanSchema.safeParse(rawPlan);
    if (!parsed.success) return null;
    return {
      actionId: parsed.data.actionId,
      actionType: parsed.data.actionType,
      providerOutcome: progress?.phase === PRESSED_PHASE ? 'uncertain' : 'not_attempted',
      campaignId: null,
      message: error.message.slice(0, 500) || null,
    };
  },
};

type Report = ((progress: Record<string, unknown>) => Promise<void>) | undefined;

async function* apply(plan: AdActionPlan, site: AdActionSite, signal: AbortSignal, report: Report): AsyncGenerator<CollectedChunk, CollectFinish<AdActionResult>, undefined> {
  const campaign = plan.createCampaign;
  // 다른 광고센터 계정이면 쓰지 않는다(보고서 수집과 같은 업체코드 대조).
  if (plan.vendorId !== null) {
    const vendorId = await site.readVendorId();
    if (vendorId !== plan.vendorId) {
      throw new RuntimeError(ADVERTISING_IDENTITY_MISMATCH, '광고센터 업체코드가 광고 액션의 계정과 일치하지 않습니다. 그 계정으로 다시 로그인한 뒤 실행해 주세요.', {
        plannedVendorId: plan.vendorId,
        observedVendorId: vendorId,
      });
    }
  }
  signal.throwIfAborted();

  // 앞선 실행이 캠페인을 만들고 보고를 잃었을 수 있다 — 같은 이름이 있으면 만들지 않는다. 목록을 끝까지 못 읽으면 던진다.
  const existing = findByName(await readRoster(site), campaign.name);
  // 임대(10분)를 연장한다 — 업체 확인·목록 읽기와 폼 채우기가 각각 몇 분 걸릴 수 있다.
  await report?.({ phase: 'checked' });
  let submission: { campaignId: string | null; message: string | null };
  if (existing) {
    submission = { campaignId: existing, message: EXISTING_MESSAGE };
  } else {
    signal.throwIfAborted();
    const pressed = await site.createCampaign(campaign, { signal, onFilled: async () => report?.({ phase: 'filled' }) });
    // 여기서부터의 실패(목록 다시 읽기·증거 쓰기)는 캠페인이 생겼을 수 있다 — failureResult가 uncertain으로 적는다.
    await report?.({ phase: PRESSED_PHASE });
    let campaignId = pressed.campaignId;
    // 눌렀지만 번호를 못 읽었다 — 목록에서 이름으로 찾는다. 읽기 실패는 uncertain으로 남긴다(다시 누르지 않는다).
    if (!campaignId) campaignId = findByName(await readRoster(site).catch(() => []), campaign.name);
    submission = { campaignId, message: pressed.message };
  }

  const evidence: AdActionEvidence = {
    campaignId: submission.campaignId,
    campaignName: campaign.name,
    observedAt: new Date().toISOString(),
    message: submission.message?.slice(0, 500) ?? null,
  };
  yield { chunkKind: AD_ACTION_EVIDENCE_CHUNK_KIND, payload: [evidence], progress: { phase: 'submitted' } };
  return {
    result: {
      actionId: plan.actionId,
      actionType: plan.actionType,
      providerOutcome: submission.campaignId ? 'created' : 'uncertain',
      campaignId: submission.campaignId,
      message: evidence.message,
    },
  };
}

async function readRoster(site: AdActionSite): Promise<Array<{ id: string; name: string }>> {
  const campaigns: Array<{ id: string; name: string }> = [];
  for (let page = 0; ; page += 1) {
    if (page >= MAX_CAMPAIGN_PAGES) throw new RuntimeError('SITE_REQUEST_FAILED', '광고센터 캠페인 목록이 너무 깁니다.', { reason: 'campaign_page_limit', page });
    const list = await site.listCampaigns(page);
    for (const value of list) {
      const campaign = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
      const id = idOf(campaign?.id ?? campaign?.campaignId);
      if (id && typeof campaign?.name === 'string') campaigns.push({ id, name: campaign.name });
    }
    if (list.length < CAMPAIGN_PAGE_SIZE) return campaigns;
  }
}

function findByName(campaigns: Array<{ id: string; name: string }>, name: string): string | null {
  const wanted = normalize(name);
  return campaigns.find((campaign) => normalize(campaign.name) === wanted)?.id ?? null;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function idOf(value: unknown): string | null {
  const text = typeof value === 'number' ? (Number.isSafeInteger(value) ? String(value) : '') : typeof value === 'string' ? value.trim() : '';
  return /^[1-9]\d*$/.test(text) ? text : null;
}

registerCollector(adActionCollector);
