import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { DataMigration } from '../types';

/**
 * KID-305: the Wing representative-image upload history moves from Content's
 * `thumbnail_registration_attempts` into Channels' registration execution ledger
 * (`product_registration_executions`, `execution_kind = 'thumbnail_update'`),
 * before the schema push drops the attempt table.
 *
 * Each attempt becomes one execution. An Agent attempt keeps the runtime key
 * `thumbnail_update:<owner key>`, so the same owner-key replay finds it; a browser
 * attempt is keyed `thumbnail_update:legacy:<attempt id>`. A rerun inserts nothing. `uploaded` is a success and
 * `failed` a definitive failure. A live attempt with an owner key (Agent) is an
 * unknown outcome left `reconciling`; one without (an old browser prepare the old
 * screen showed as not registered) ends as a definitive failure. The frozen
 * payload is rebuilt from the generation, its workspace and its selected image
 * (`sha256: 'legacy'` — the bytes were never hashed). The account is the
 * workspace listing's account, else the organization's single active Coupang
 * account.
 *
 * The listing stays in the frozen payload only; the row's `channel_listing_id` is
 * NULL, like every thumbnail_update execution, so a moved attempt never takes a
 * listing's live-execution slot or its stockout check.
 *
 * An attempt without a generation/workspace, an image or an account, and an older
 * live attempt of a generation that has a newer one are counted as skipped and left
 * behind for the table drop (ADR-0010). Nothing aborts the run.
 */
export const moveThumbnailRegistrationAttemptsToExecutionsMigration: DataMigration = {
  id: 'v0.1.31:026_move_thumbnail_registration_attempts_to_executions',
  releaseVersion: '0.1.31',
  name: 'Move thumbnail registration attempts into thumbnail_update registration executions',
  phase: 'pre-schema',
  async run(tx) {
    if (!(await tableExists(tx, 'thumbnail_registration_attempts'))) {
      return { affectedRows: 0, details: { outcome: 'absent' } };
    }

    const attempts = await readAttempts(tx);
    const skipped = { workspace: 0, image: 0, account: 0, supersededLive: 0 };
    let alreadyMoved = 0;
    let moved = 0;
    const byStatus = { succeeded: 0, failed: 0, reconciling: 0 };
    const newestLiveByGeneration = newestLiveAttempts(attempts);

    for (const attempt of attempts) {
      if (attempt.alreadyMoved) {
        alreadyMoved += 1;
        continue;
      }
      if (!attempt.workspaceId) { skipped.workspace += 1; continue; }
      const imageUrl = attempt.selectedUrl ?? (attempt.candidateUrls.length === 1 ? attempt.candidateUrls[0]! : null);
      if (!imageUrl) { skipped.image += 1; continue; }
      const account = attempt.listingAccountId
        ? { channelAccountId: attempt.listingAccountId, channelListingId: attempt.workspaceListingId }
        : attempt.singleCoupangAccountId
          ? { channelAccountId: attempt.singleCoupangAccountId, channelListingId: null }
          : null;
      if (!account) { skipped.account += 1; continue; }

      const transition = legacyTransition(attempt);
      if (transition.status === 'reconciling' && newestLiveByGeneration.get(attempt.generationId) !== attempt.id) {
        skipped.supersededLive += 1;
        continue;
      }

      const payload = {
        kind: 'thumbnail_update',
        generationId: attempt.generationId,
        contentWorkspaceId: attempt.workspaceId,
        salesProductId: attempt.workspaceSalesProductId,
        channelListingId: account.channelListingId,
        productName: decodeProductName(attempt.listingChannelName?.trim() || attempt.workspaceDisplayName || ''),
        image: { url: imageUrl, assetId: null, sha256: 'legacy' },
      };
      const payloadHash = createHash('sha256').update(canonicalJson(payload)).digest('hex');
      const resultJson = {
        legacyAttemptId: attempt.id,
        screenshotPath: attempt.screenshotUrl,
        externalId: attempt.externalId,
      };

      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO product_registration_executions (
          id, organization_id, channel_account_id, channel_listing_id, execution_kind,
          idempotency_key, request_hash, owner_idempotency_key,
          submission_payload_json, submission_payload_hash,
          status, provider_outcome, result_json, last_error_code, last_error_message,
          started_at, completed_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${attempt.organizationId}::uuid, ${account.channelAccountId}::uuid,
          NULL, 'thumbnail_update',
          ${executionIdempotencyKey(attempt)}, ${attempt.requestHash ?? payloadHash}, ${attempt.ownerIdempotencyKey},
          ${JSON.stringify(payload)}::jsonb, ${payloadHash},
          ${transition.status}, ${transition.providerOutcome}, ${JSON.stringify(resultJson)}::jsonb,
          ${transition.errorCode}, ${transition.errorMessage},
          ${attempt.startedAt}, ${transition.status === 'reconciling' ? null : (attempt.finishedAt ?? attempt.updatedAt)},
          ${attempt.createdAt}, ${attempt.updatedAt}
        )
        ON CONFLICT DO NOTHING
        RETURNING id::text AS id
      `;
      // 행은 listing 을 적지 않으므로 남은 unique 는 멱등 키뿐이다 — 이미 옮긴 것이다.
      if (inserted.length === 0) { alreadyMoved += 1; continue; }
      moved += 1;
      byStatus[transition.status] += 1;
    }

    const skippedTotal = Object.values(skipped).reduce((sum, count) => sum + count, 0);
    return {
      affectedRows: moved,
      details: {
        outcome: 'moved',
        attempts: attempts.length,
        moved,
        movedByStatus: byStatus,
        alreadyMoved,
        skipped: skippedTotal,
        skippedBy: skipped,
      },
    };
  },
};

type LegacyAttempt = {
  id: string;
  organizationId: string;
  generationId: string;
  status: string;
  ownerIdempotencyKey: string | null;
  requestHash: string | null;
  errorMessage: string | null;
  screenshotUrl: string | null;
  externalId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  alreadyMoved: boolean;
  workspaceId: string | null;
  workspaceDisplayName: string | null;
  workspaceSalesProductId: string | null;
  workspaceListingId: string | null;
  listingAccountId: string | null;
  listingChannelName: string | null;
  singleCoupangAccountId: string | null;
  selectedUrl: string | null;
  candidateUrls: string[];
};

async function readAttempts(tx: Prisma.TransactionClient): Promise<LegacyAttempt[]> {
  return tx.$queryRaw<LegacyAttempt[]>`
    -- queryraw-tenancy-exempt: the writer-stopped cutover moves every organization's history at once.
    SELECT
      a.id::text AS "id",
      a.organization_id::text AS "organizationId",
      a.generation_id::text AS "generationId",
      a.status AS "status",
      a.owner_idempotency_key AS "ownerIdempotencyKey",
      a.request_hash AS "requestHash",
      a.error_message AS "errorMessage",
      a.screenshot_url AS "screenshotUrl",
      a.external_id AS "externalId",
      a.started_at AS "startedAt",
      a.finished_at AS "finishedAt",
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      EXISTS (
        SELECT 1 FROM product_registration_executions e
        WHERE e.organization_id = a.organization_id
          AND e.idempotency_key = CASE
            WHEN a.owner_idempotency_key IS NOT NULL THEN 'thumbnail_update:' || a.owner_idempotency_key
            ELSE 'thumbnail_update:legacy:' || a.id::text
          END
      ) AS "alreadyMoved",
      w.id::text AS "workspaceId",
      w.display_name AS "workspaceDisplayName",
      w.sales_product_id::text AS "workspaceSalesProductId",
      w.channel_listing_id::text AS "workspaceListingId",
      l.channel_account_id::text AS "listingAccountId",
      l.channel_name AS "listingChannelName",
      (
        SELECT CASE WHEN count(*) = 1 THEN min(c.id::text) END
        FROM channel_accounts c
        WHERE c.organization_id = a.organization_id AND c.channel = 'coupang' AND c.status = 'active'
      ) AS "singleCoupangAccountId",
      g.selected_url AS "selectedUrl",
      COALESCE((
        SELECT array_agg(gc.url ORDER BY gc.sort_order, gc.created_at)
        FROM thumbnail_generation_candidates gc
        WHERE gc.generation_id = g.id AND gc.organization_id = g.organization_id
      ), ARRAY[]::text[]) AS "candidateUrls"
    FROM thumbnail_registration_attempts a
    LEFT JOIN thumbnail_generations g
      ON g.id = a.generation_id AND g.organization_id = a.organization_id
    LEFT JOIN content_workspaces w
      ON w.id = g.content_workspace_id AND w.organization_id = g.organization_id
    LEFT JOIN channel_listings l
      ON l.id = w.channel_listing_id AND l.organization_id = w.organization_id
    ORDER BY a.created_at, a.id
  `;
}

/**
 * Agent 시도는 런타임과 같은 `thumbnail_update:<owner key>` 를 써서 같은 owner 키의 재생이 이 실행을
 * 찾게 한다. 화면 시도는 `thumbnail_update:legacy:<attempt id>` 다.
 */
function executionIdempotencyKey(attempt: LegacyAttempt): string {
  return attempt.ownerIdempotencyKey
    ? `thumbnail_update:${attempt.ownerIdempotencyKey}`
    : `thumbnail_update:legacy:${attempt.id}`;
}

export const UNREPORTED_BROWSER_ATTEMPT_MESSAGE = '이관: 결과를 보고받지 못한 이전 화면 시도';

/**
 * 살아 있던 시도 중 owner 키가 없는 것은 옛 화면의 prepare 다. 옛 화면은 그것을 "등록 안 됨" 으로
 * 보였으므로 끝난 실패로 옮긴다. owner 키가 있는(Agent) 살아 있는 시도만 `reconciling` 이다.
 */
function legacyTransition(attempt: Pick<LegacyAttempt, 'status' | 'ownerIdempotencyKey' | 'errorMessage'>): {
  status: 'succeeded' | 'failed' | 'reconciling';
  providerOutcome: 'succeeded' | 'definitive_failure' | 'uncertain';
  errorCode: 'thumbnail_rejected' | 'thumbnail_outcome_unknown' | null;
  errorMessage: string | null;
} {
  if (attempt.status === 'uploaded') return { status: 'succeeded', providerOutcome: 'succeeded', errorCode: null, errorMessage: null };
  if (attempt.status === 'failed') {
    return { status: 'failed', providerOutcome: 'definitive_failure', errorCode: 'thumbnail_rejected', errorMessage: attempt.errorMessage };
  }
  if (!attempt.ownerIdempotencyKey) {
    return { status: 'failed', providerOutcome: 'definitive_failure', errorCode: 'thumbnail_rejected', errorMessage: UNREPORTED_BROWSER_ATTEMPT_MESSAGE };
  }
  return { status: 'reconciling', providerOutcome: 'uncertain', errorCode: 'thumbnail_outcome_unknown', errorMessage: attempt.errorMessage };
}

/** 살아 있는 실행은 생성마다 하나다 — 가장 최근 live attempt 만 `reconciling` 으로 옮긴다. */
function newestLiveAttempts(attempts: readonly LegacyAttempt[]): Map<string, string> {
  const newest = new Map<string, LegacyAttempt>();
  for (const attempt of attempts) {
    if (legacyTransition(attempt).status !== 'reconciling') continue;
    const key = `${attempt.organizationId}:${attempt.generationId}`;
    const current = newest.get(key);
    if (!current || attempt.createdAt > current.createdAt || (attempt.createdAt.getTime() === current.createdAt.getTime() && attempt.id > current.id)) {
      newest.set(key, attempt);
    }
  }
  return new Map([...newest.values()].map((attempt) => [attempt.generationId, attempt.id]));
}

async function tableExists(tx: Prisma.TransactionClient, table: string): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass(${table}) IS NOT NULL AS present`;
  return Boolean(row?.present);
}

/** Same URL-decoding rule the runtime uses for the Coupang product name. */
function decodeProductName(value: string): string {
  let current = value.trim();
  if (!/%[0-9A-Fa-f]{2}/.test(current)) return current;
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(current).trim();
      if (decoded === current) return decoded;
      current = decoded;
    } catch {
      return current;
    }
  }
  return current;
}

/** Sorted-key JSON, the same canonical form the execution fence hashes. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}
