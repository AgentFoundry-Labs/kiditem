import { describe, it, expect } from 'vitest';
import { isReady, isApplied, isActive, isCompleted } from '../thumbnail-status';

describe('thumbnail-status helpers', () => {
  describe('isReady', () => {
    it('true when status=succeeded and phase=ready', () => {
      expect(isReady({ status: 'succeeded', phase: 'ready' })).toBe(true);
    });
    it('false when status=succeeded and phase=applied', () => {
      expect(isReady({ status: 'succeeded', phase: 'applied' })).toBe(false);
    });
    it('false when status=running', () => {
      expect(isReady({ status: 'running', phase: null })).toBe(false);
    });
  });

  describe('isApplied', () => {
    it('true when status=succeeded and phase=applied', () => {
      expect(isApplied({ status: 'succeeded', phase: 'applied' })).toBe(true);
    });
    it('false when phase=ready', () => {
      expect(isApplied({ status: 'succeeded', phase: 'ready' })).toBe(false);
    });
    it('false when status=cancelled', () => {
      expect(isApplied({ status: 'cancelled', phase: null })).toBe(false);
    });
  });

  describe('isActive', () => {
    it('true when status=pending', () => {
      expect(isActive({ status: 'pending', phase: null })).toBe(true);
    });
    it('true when status=running', () => {
      expect(isActive({ status: 'running', phase: null })).toBe(true);
    });
    it('false when status=succeeded', () => {
      expect(isActive({ status: 'succeeded', phase: 'ready' })).toBe(false);
    });
    it('false when status=failed', () => {
      expect(isActive({ status: 'failed', phase: null })).toBe(false);
    });
  });

  describe('isCompleted', () => {
    it('true when status=succeeded regardless of phase', () => {
      expect(isCompleted({ status: 'succeeded', phase: 'ready' })).toBe(true);
      expect(isCompleted({ status: 'succeeded', phase: 'applied' })).toBe(true);
    });
    it('false for all non-succeeded statuses', () => {
      expect(isCompleted({ status: 'pending', phase: null })).toBe(false);
      expect(isCompleted({ status: 'running', phase: null })).toBe(false);
      expect(isCompleted({ status: 'failed', phase: null })).toBe(false);
      expect(isCompleted({ status: 'cancelled', phase: null })).toBe(false);
    });
  });
});
