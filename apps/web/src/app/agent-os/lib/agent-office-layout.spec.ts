import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFFICE_AVATAR_SRC,
  OFFICE_SEATS,
  OFFICE_WORLD_SIZE,
  getOfficeDestination,
  getOfficeEmployeeRect,
  getOfficeMotionPoints,
  getOfficeSeat,
  officeRectsOverlap,
} from './agent-office-layout';
import type { AgentOfficeNodeStatus } from './agent-office-model';

const employeeTypes = [
  'manager',
  'ad_strategy',
  'chat',
  'sourcing',
  'listing',
  'order',
  'channel_registration',
] as const;

const destinationStatuses = [
  'working',
  'offline',
  'idle',
  'waiting',
  'blocked',
] as const satisfies readonly AgentOfficeNodeStatus[];

describe('agent office layout', () => {
  it('assigns the seven employees unique desks and role-specific avatars', () => {
    const seats = employeeTypes.map((type, index) => getOfficeSeat(type, index));
    const desks = seats.map((seat) => `${seat.desk.x}:${seat.desk.y}`);

    expect(new Set(desks).size).toBe(7);
    expect(seats.map((seat) => seat.employeeType)).toEqual(employeeTypes);
    expect(seats.every((seat) => seat.avatarSrc.endsWith('.png'))).toBe(true);
  });

  it('maps statuses to stable scene destinations', () => {
    const seat = getOfficeSeat('manager', 0);

    expect(getOfficeDestination(seat, 'working')).toEqual(seat.desk);
    expect(getOfficeDestination(seat, 'idle')).toEqual(seat.idle);
    expect(getOfficeDestination(seat, 'waiting')).toEqual(seat.waiting);
    expect(getOfficeDestination(seat, 'blocked')).toEqual(seat.blocked);
    expect(getOfficeDestination(seat, 'offline')).toEqual(seat.desk);
  });

  it('keeps every seven-employee status combination collision-free and in bounds', () => {
    for (let leftIndex = 0; leftIndex < OFFICE_SEATS.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < OFFICE_SEATS.length;
        rightIndex += 1
      ) {
        const leftSeat = OFFICE_SEATS[leftIndex];
        const rightSeat = OFFICE_SEATS[rightIndex];

        for (const leftStatus of destinationStatuses) {
          for (const rightStatus of destinationStatuses) {
            const leftRect = getOfficeEmployeeRect(
              getOfficeDestination(leftSeat, leftStatus),
            );
            const rightRect = getOfficeEmployeeRect(
              getOfficeDestination(rightSeat, rightStatus),
            );

            expect(
              officeRectsOverlap(leftRect, rightRect),
              `${leftSeat.employeeType}:${leftStatus} overlaps ${rightSeat.employeeType}:${rightStatus}`,
            ).toBe(false);
          }
        }
      }
    }

    for (const seat of OFFICE_SEATS) {
      for (const status of destinationStatuses) {
        const rect = getOfficeEmployeeRect(getOfficeDestination(seat, status));

        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(100);
        expect(rect.y + rect.height).toBeLessThanOrEqual(100);
      }
    }

    expect(OFFICE_WORLD_SIZE).toEqual({ width: 1200, height: 750 });
  });

  it('creates deterministic, non-overlapping overflow seats', () => {
    const first = getOfficeSeat('reviewer', 7);
    const repeated = getOfficeSeat('reviewer', 7);
    const second = getOfficeSeat('auditor', 8);

    expect(first).toEqual(repeated);
    expect(first.desk).not.toEqual(second.desk);
    expect(first.avatarSrc).toBe(DEFAULT_OFFICE_AVATAR_SRC);
  });

  it('starts and ends motion at authoritative status destinations', () => {
    const seat = getOfficeSeat('listing', 4);
    const points = getOfficeMotionPoints({
      seat,
      fromStatus: 'idle',
      toStatus: 'blocked',
    });

    expect(points[0]).toEqual(seat.idle);
    expect(points.at(-1)).toEqual(seat.blocked);
  });
});
