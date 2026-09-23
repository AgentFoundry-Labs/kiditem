import { describe, it, expect } from 'vitest';
import { isThumbnailJobActive, isThumbnailJobAdopted, isThumbnailJobAwaitingAdoption } from '../thumbnail-status';

const candidate = { id: 'a1' };

describe('thumbnail job status helpers', () => {
  it('treats pending and running as active', () => {
    expect(isThumbnailJobActive({ status: 'pending' })).toBe(true);
    expect(isThumbnailJobActive({ status: 'running' })).toBe(true);
    expect(isThumbnailJobActive({ status: 'succeeded' })).toBe(false);
    expect(isThumbnailJobActive({ status: 'failed' })).toBe(false);
  });

  it('waits for adoption only when the job succeeded with candidates and none is the representative image', () => {
    expect(isThumbnailJobAwaitingAdoption({ status: 'succeeded', candidates: [candidate], adoptedCandidate: null })).toBe(true);
    expect(isThumbnailJobAwaitingAdoption({ status: 'succeeded', candidates: [], adoptedCandidate: null })).toBe(false);
    expect(isThumbnailJobAwaitingAdoption({ status: 'succeeded', candidates: [candidate], adoptedCandidate: candidate })).toBe(false);
    expect(isThumbnailJobAwaitingAdoption({ status: 'running', candidates: [candidate], adoptedCandidate: null })).toBe(false);
  });

  it('is adopted when one of its candidates is the workspace representative image', () => {
    expect(isThumbnailJobAdopted({ status: 'succeeded', adoptedCandidate: candidate })).toBe(true);
    expect(isThumbnailJobAdopted({ status: 'succeeded', adoptedCandidate: null })).toBe(false);
  });
});
