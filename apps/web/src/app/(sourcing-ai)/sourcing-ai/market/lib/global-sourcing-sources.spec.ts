import { describe, expect, it } from 'vitest';
import {
  GLOBAL_SOURCING_SOURCES,
  GLOBAL_SOURCING_STAGES,
  GLOBAL_SOURCING_NEXT_CONNECTORS,
  sourcesForStage,
} from './global-sourcing-sources';

describe('global sourcing source coverage', () => {
  it('keeps the decision pipeline in China to global to Korea order', () => {
    expect(GLOBAL_SOURCING_STAGES.map((stage) => stage.id)).toEqual([
      'china',
      'global',
      'korea',
    ]);
  });

  it('marks only implemented data paths as collectors or live API', () => {
    expect(
      GLOBAL_SOURCING_SOURCES
        .filter((source) => ['collector', 'live-api'].includes(source.integrationMode))
        .map((source) => source.id),
    ).toEqual(['1688', 'youtube', 'naver']);
  });

  it('does not present planned China sources as live', () => {
    const chinaSources = sourcesForStage('china');

    expect(chinaSources.find((source) => source.id === 'douyin')?.integrationMode).toBe(
      'research-snapshot',
    );
    expect(
      chinaSources
        .filter((source) => ['taobao', 'pdd', 'xiaohongshu'].includes(source.id))
        .every((source) => source.integrationMode === 'planned'),
    ).toBe(true);
  });

  it('prioritizes an official Taobao connector before commercial estimates', () => {
    expect(GLOBAL_SOURCING_NEXT_CONNECTORS[0]).toMatchObject({
      id: 'taobao-tbk',
      priority: 1,
    });
    expect(GLOBAL_SOURCING_NEXT_CONNECTORS.find((source) => source.id === 'rank1688')?.disclosure)
      .toContain('공식 데이터가 아니며');
  });
});
