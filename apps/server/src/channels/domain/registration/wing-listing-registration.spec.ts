import { describe, expect, it } from 'vitest';
import { wingListingRegistrationDate } from './wing-listing-registration';

const REGISTRATION = '11111111-1111-4111-8111-111111111111';

describe('wingListingRegistrationDate', () => {
  it('dates a KidItem registration by its KST day, not its UTC day', () => {
    // 15:30Z on 09-01 is 00:30 KST on 09-02.
    expect(wingListingRegistrationDate({
      createdOn: null,
      salesProductId: REGISTRATION,
      createdAt: new Date('2026-09-01T15:30:00.000Z'),
    })).toBe('2026-09-02');
  });

  it("prefers Wing's createdOn over KidItem's registration time", () => {
    expect(wingListingRegistrationDate({
      createdOn: '2026-08-20 09:00:00',
      salesProductId: REGISTRATION,
      createdAt: new Date('2026-09-01T03:00:00.000Z'),
    })).toBe('2026-08-20');
  });

  it('knows no registration date without createdOn or a KidItem registration', () => {
    expect(wingListingRegistrationDate({
      createdOn: null,
      salesProductId: null,
      createdAt: new Date('2026-09-01T03:00:00.000Z'),
    })).toBeNull();
  });

  it("reads Wing's space-separated createdOn as KST", () => {
    // Read as UTC, 23:50 would fall on the next KST day.
    expect(wingListingRegistrationDate({
      createdOn: '2026-09-02 23:50:00',
      salesProductId: null,
      createdAt: new Date('2026-09-10T03:00:00.000Z'),
    })).toBe('2026-09-02');
  });
});
