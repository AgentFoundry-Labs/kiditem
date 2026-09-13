import { Prisma, type ChannelAdTargetDailySnapshot, type SourceImportRun } from '@prisma/client';
import { mergeKeywordTargets } from '../../../application/service/ad-keyword-normalizer';
import { compareAttemptsNewestFirst, isNewerAttempt } from '../../../../common/current-row';
import type { UpsertAdTargetDailyInput } from '../../../application/port/out/repository/channel-target-daily.repository.port';

type Coverage = {
  campaignIdentity: string;
  adGroupId: string;
  capturedAt: string;
  businessDate: string;
};
type PublishedGroup = {
  attempt: SourceImportRun;
  coverage: Coverage | null;
  observedAt: number;
};
type KeywordFact = ChannelAdTargetDailySnapshot & {
  targetType: 'keyword';
  keyword: string;
};

function manifest(attempt: SourceImportRun) {
  const report = attempt.qualityReport as {
    rosterCapturedAt?: string;
    keywordCoverage?: Coverage[];
  } | null;
  return {
    rosterAt: Date.parse(report?.rosterCapturedAt ?? ''),
    groups: (report?.keywordCoverage ?? []).filter(
      (group) =>
        typeof group.campaignIdentity === 'string' &&
        typeof group.adGroupId === 'string' &&
        Number.isFinite(Date.parse(group.capturedAt)) &&
        /^\d{4}-\d{2}-\d{2}$/.test(group.businessDate),
    ),
  };
}

const groupKey = (group: Coverage) => JSON.stringify([group.campaignIdentity, group.adGroupId]);

function recency(group: PublishedGroup) {
  return {
    observedAt: group.observedAt,
    importedAt: group.attempt.importedAt,
    id: group.attempt.id,
  };
}

/** Select published scopes before facts/period filters; absence is a roster observation, not finalization. */
export async function readCompleteAdKeywordFacts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: {
    channelAccountId?: string;
    campaignIdentity?: string;
    from?: Date;
    to?: Date;
  } = {},
) {
  const published = await tx.sourceImportRun.findMany({
    where: {
      organizationId,
      status: 'completed',
      OR: [
        { sourceType: 'coupang_ad_keyword', parserVersion: 'ad-keyword-v1' },
        { sourceType: 'coupang_ad_campaign', parserVersion: 'ad-campaign-v1' },
      ],
      ...(input.channelAccountId ? { channelAccountId: input.channelAccountId } : {}),
    },
  });
  const accounts = new Map<string, typeof published>();
  for (const attempt of published) {
    if (!attempt.channelAccountId) continue;
    const list = accounts.get(attempt.channelAccountId) ?? [];
    list.push(attempt);
    accounts.set(attempt.channelAccountId, list);
  }
  const attempts: SourceImportRun[] = [];
  const selected: PublishedGroup[] = [];
  for (const accountAttempts of accounts.values()) {
    const snapshots = accountAttempts.map((attempt) => ({
      attempt,
      ...manifest(attempt),
    }));
    const full = snapshots.filter(
      (snapshot) =>
        snapshot.attempt.sourceType === 'coupang_ad_keyword' && Number.isFinite(snapshot.rosterAt),
    );
    full.sort((a, b) => compareAttemptsNewestFirst(
      { observedAt: a.rosterAt, importedAt: a.attempt.importedAt, id: a.attempt.id },
      { observedAt: b.rosterAt, importedAt: b.attempt.importedAt, id: b.attempt.id },
    ));
    if (full[0]) attempts.push(full[0].attempt);
    const groups = new Set(snapshots.flatMap((snapshot) => snapshot.groups.map(groupKey)));
    for (const key of groups) {
      let winner: PublishedGroup | undefined;
      for (const snapshot of snapshots) {
        const coverage = snapshot.groups.find((group) => groupKey(group) === key) ?? null;
        if (!coverage && !full.includes(snapshot)) continue;
        const candidate = {
          attempt: snapshot.attempt,
          coverage,
          observedAt: coverage ? Date.parse(coverage.capturedAt) : snapshot.rosterAt,
        };
        if (!winner || isNewerAttempt(recency(candidate), recency(winner))) winner = candidate;
      }
      if (winner?.coverage) selected.push(winner);
    }
  }
  const contributions = selected.length
    ? await tx.channelAdTargetDailySnapshot.findMany({
        where: {
          organizationId,
          targetType: 'keyword',
          keyword: { not: null },
          OR: selected.map(({ attempt, coverage }) => ({
            sourceImportRunId: attempt.id,
            channelAccountId: attempt.channelAccountId!,
            campaignIdentity: coverage!.campaignIdentity,
            adGroupId: coverage!.adGroupId,
            businessDate: new Date(coverage!.businessDate),
          })),
          ...(input.campaignIdentity ? { campaignIdentity: input.campaignIdentity } : {}),
          ...(input.from || input.to ? { businessDate: { gte: input.from, lte: input.to } } : {}),
        },
      })
    : [];
  // Preserve the provider's existing target-key merge order, within each account only.
  contributions.sort(
    (a, b) =>
      `${a.campaignId}:${a.adGroupId}`.localeCompare(`${b.campaignId}:${b.adGroupId}`) ||
      a.id.localeCompare(b.id),
  );
  const rows = new Map<string, KeywordFact>();
  for (const contribution of contributions) {
    const target = {
      ...contribution,
      targetType: 'keyword' as const,
      keyword: contribution.keyword!,
    };
    const key = JSON.stringify([target.channelAccountId, target.targetKey]);
    const previous = rows.get(key);
    rows.set(
      key,
      previous
        ? ({
            ...previous,
            ...mergeKeywordTargets(
              {
                ...previous,
                metaJson: previous.metaJson as UpsertAdTargetDailyInput['metaJson'],
              },
              {
                ...target,
                metaJson: target.metaJson as UpsertAdTargetDailyInput['metaJson'],
              },
            ),
            keyword: previous.keyword,
            targetType: 'keyword',
            metaJson: previous.metaJson,
          } as KeywordFact)
        : target,
    );
  }
  return { attempts, rows: [...rows.values()] };
}

/** Campaign daily grains share one account snapshot, including an authoritative empty generation. */
export function completeAdCampaignSourceIds(organizationId: string) {
  return Prisma.sql`
    SELECT DISTINCT ON (channel_account_id) id
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = 'coupang_ad_campaign' AND parser_version = 'ad-campaign-v1'
      AND status = 'completed' AND channel_account_id IS NOT NULL
      -- Manual displayed-range reports are private exact-period evidence. They
      -- do not own campaign daily facts or the current roster, so they must
      -- never replace the sweep generation consumed by campaign/action reads.
      -- New campaign plans always carry an explicit captureMode at admission;
      -- missing mode is not a published sweep under the hard cutover.
      AND plan ->> 'captureMode' = 'campaign_sweep'
    ORDER BY channel_account_id, freshness_generation DESC NULLS LAST, id DESC
  `;
}
