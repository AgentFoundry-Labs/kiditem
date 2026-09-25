import { describe, expect, it } from 'vitest';
import {
  buildTiktokSourcePlan,
  hasCompleteTiktokCoverage,
  normalizeTiktokSourceBatch,
  plannedTiktokTargetIds,
} from '../sourcing-tiktok-source-attempt.mapper';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000010';

describe('TikTok source-attempt mapper', () => {
  it('freezes the legacy target seed trimming, fallback, and 20-seed server target cap', () => {
    const plan = buildTiktokSourcePlan({
      targetSeeds: [
        { label: '  School supplies  ', keyword: '  school supplies ' },
        { label: '  ', keyword: ' slime ' },
        { label: 'ignored', keyword: '   ' },
        ...Array.from({ length: 20 }, (_, index) => ({
          label: `extra-${index}`,
          keyword: `extra-${index}`,
        })),
      ],
    });

    expect(plan.targetSeeds).toEqual([
      { label: 'School supplies', keyword: 'school supplies' },
      { label: 'slime', keyword: 'slime' },
      ...Array.from({ length: 18 }, (_, index) => ({
        label: `extra-${index}`,
        keyword: `extra-${index}`,
      })),
    ]);
    expect(plannedTiktokTargetIds(plan).slice(0, 4)).toEqual([
      'hashtag',
      'product',
      'keyword:school supplies',
      'keyword:slime',
    ]);
  });

  it('preserves the legacy provider mapping while adding only visited target coverage', () => {
    const normalized = normalizeTiktokSourceBatch({
      organizationId: ORGANIZATION_ID,
      operationId: ATTEMPT_ID,
      batch: {
        region: '  kr  ',
        items: [
          {
            trendType: ' hashtag ',
            entityKey: ' school-supplies ',
            label: '  Back-to-school  ',
            industry: 42,
            sourceKeyword: '  school supplies  ',
            rank: 'invalid',
            postCount: -1,
            viewCount: Number.POSITIVE_INFINITY,
            growthPct: 'invalid',
            thumbnailUrl: 'ftp://not-allowed.example/image',
            sourceUrl: ' https://example.com/a?keep=exact ',
          },
          {
            trendType: 'hashtag',
            entityKey: 'school-supplies',
          },
        ],
        visitedTargetIds: ['hashtag'],
        errors: Array.from({ length: 51 }, () => ({ intentionally: 'not validated' })),
      },
    });

    expect(normalized.region).toBe('KR');
    expect(normalized.errorCount).toBe(50);
    expect(normalized.rows).toEqual([
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationId: ATTEMPT_ID,
        trendType: 'hashtag',
        entityKey: 'school-supplies',
        rank: 1,
        label: 'Back-to-school',
        industry: null,
        sourceKeyword: 'school supplies',
        postCount: null,
        viewCount: null,
        growthPct: null,
        thumbnailUrl: null,
        sourceUrl: 'https://example.com/a?keep=exact',
      }),
    ]);
  });

  it('accepts only full coverage or a max-item prefix and rejects excess normalized rows', () => {
    const plan = buildTiktokSourcePlan({
      targetSeeds: [{ label: 'slime', keyword: 'slime' }],
      maxItems: 1,
    });
    const fullVisited = ['hashtag', 'product', 'keyword:slime'];
    const normalized = normalizeTiktokSourceBatch({
      organizationId: ORGANIZATION_ID,
      operationId: ATTEMPT_ID,
      batch: {
        region: 'US',
        items: [
          { trendType: 'hashtag', entityKey: 'one' },
          { trendType: 'product', entityKey: 'two' },
        ],
        visitedTargetIds: fullVisited,
      },
    });

    expect(hasCompleteTiktokCoverage(plan, normalized)).toBe(false);
    expect(hasCompleteTiktokCoverage(plan, {
      ...normalized,
      rows: normalized.rows.slice(0, 1),
      visitedTargetIds: ['hashtag'],
    })).toBe(true);
  });
});
