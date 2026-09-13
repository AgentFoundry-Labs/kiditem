import { describe, expect, it } from 'vitest';
import { competitorCollectionStatus } from './competitor-tracking';

const facts = {
  ownProductCount: 3,
  enabledTrackerCount: 2,
  serpSnapshotCount: 5,
};

describe('competitorCollectionStatus', () => {
  it('derives the collection word from the counts the overview carries', () => {
    expect(competitorCollectionStatus(facts)).toBe('ready');
    expect(competitorCollectionStatus({ ...facts, serpSnapshotCount: 0 }))
      .toBe('not_collected');
    expect(competitorCollectionStatus({ ...facts, enabledTrackerCount: 0, serpSnapshotCount: 0 }))
      .toBe('not_configured');
  });

  it('names an empty own catalog before tracker or snapshot absence', () => {
    expect(competitorCollectionStatus({
      ownProductCount: 0,
      enabledTrackerCount: 0,
      serpSnapshotCount: 0,
    })).toBe('catalog_empty');
    expect(competitorCollectionStatus({ ...facts, ownProductCount: 0 }))
      .toBe('catalog_empty');
  });

  it('reads a tracker-less organization with snapshots as not configured', () => {
    // Snapshots from a tracker that was later disabled do not make tracking
    // configured; the tracker count decides first.
    expect(competitorCollectionStatus({ ...facts, enabledTrackerCount: 0 }))
      .toBe('not_configured');
  });
});
