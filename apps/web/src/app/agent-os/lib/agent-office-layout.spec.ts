import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFFICE_AVATAR_SRC,
  getOfficeDestination,
  getOfficeMotionPoints,
  getOfficeSeat,
} from './agent-office-layout';

const employeeTypes = [
  'manager',
  'ad_strategy',
  'chat',
  'sourcing',
  'listing',
  'order',
  'channel_registration',
] as const;

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
