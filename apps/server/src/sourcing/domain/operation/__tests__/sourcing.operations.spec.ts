import { describe, expect, it } from 'vitest';
import { SOURCING_OPERATIONS } from '../sourcing.operations';

describe('Sourcing Operations', () => {
  it('keeps direct URL scraping out of the Operation catalog', () => {
    expect(SOURCING_OPERATIONS.some((operation) => operation.key === 'sourcing.scrape_url')).toBe(false);
  });
  it('keeps Wing source collection out of the Operation catalog', () => {
    expect(SOURCING_OPERATIONS.some((operation) => operation.key === 'sourcing.collect_wing_catalog_batch')).toBe(false);
  });
  it('keeps Naver/Shorts and keyword analysis out of the generic Operation catalog', () => {
    for (const key of ['sourcing.collect_daily_trends', 'sourcing.collect_naver_trends', 'sourcing.collect_shorts_trends', 'sourcing.collect_keyword_analysis']) {
      expect(SOURCING_OPERATIONS.some((operation) => operation.key === key)).toBe(false);
    }
  });

  it('keeps only the retained live-source collection operations', () => {
    const browserLive = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_live_commerce_url',
    );
    const taobao = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_taobao_live',
    );

    expect(browserLive).toBeUndefined();
    expect(taobao).toBeUndefined();
  });

  it('does not register 1688 source collection as an Operation after its owner-attempt cutover', () => {
    expect(SOURCING_OPERATIONS.some(
      (operation) => operation.key === 'sourcing.collect_1688_trends',
    )).toBe(false);
    const daily = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_daily_trends',
    );
    expect(daily).toBeUndefined();
  });

  it('does not register TikTok Creative Center collection as an Operation after its owner-attempt cutover', () => {
    expect(SOURCING_OPERATIONS.some(
      (operation) => operation.key === 'sourcing.collect_tiktok_cc_trends',
    )).toBe(false);
  });

  it('does not register keyword suggestions after the source owner cutover', () => {
    expect(SOURCING_OPERATIONS.some(
      (operation) => operation.key === 'sourcing.collect_keyword_suggestions',
    )).toBe(false);
  });

  it('keeps 1688 server keyword/image commands out of the Operation catalog', () => {
    for (const key of ['sourcing.search_1688_keyword_batch', 'sourcing.match_wholesale_images']) {
      expect(SOURCING_OPERATIONS.some((operation) => operation.key === key)).toBe(false);
    }
  });

  it('keeps direct stored-fact rising calculation out of the Operation catalog', () => {
    expect(SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.detect_rising_products',
    )).toBeUndefined();
  });

  it('registers shadow signal collection as an exact fenced snapshot-compute operation', () => {
    const definition = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_shadow_signals',
    );

    expect(definition).toMatchObject({
      engineType: 'domain',
      ownerDomain: 'sourcing',
      resourceClass: 'snapshot_compute',
      allowedTriggers: ['dashboard', 'domain_screen', 'agent'],
      scheduleSupported: false,
    });
    expect(definition?.inputSchema.parse({})).toEqual({});
  });
});
