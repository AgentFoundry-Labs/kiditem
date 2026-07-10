import type { AgentOfficeNodeStatus } from './agent-office-model';

export interface OfficePoint {
  x: number;
  y: number;
}

export interface OfficeRect extends OfficePoint {
  width: number;
  height: number;
}

export interface OfficeSeat {
  id: string;
  employeeType: string;
  avatarSrc: string;
  desk: OfficePoint;
  idle: OfficePoint;
  waiting: OfficePoint;
  blocked: OfficePoint;
  paths: Partial<Record<AgentOfficeNodeStatus, OfficePoint[]>>;
}

export interface OfficeZone {
  id: 'desks' | 'meeting' | 'waiting' | 'lounge';
  label: string;
  hitRegion: OfficeRect;
}

export const OFFICE_WORLD_SIZE = { width: 1200, height: 750 } as const;

export const OFFICE_EMPLOYEE_FOOTPRINT = {
  width: 12,
  height: 16,
} as const;

export function getOfficeEmployeeRect(point: OfficePoint): OfficeRect {
  return {
    x: point.x - OFFICE_EMPLOYEE_FOOTPRINT.width / 2,
    y: point.y - OFFICE_EMPLOYEE_FOOTPRINT.height / 2,
    width: OFFICE_EMPLOYEE_FOOTPRINT.width,
    height: OFFICE_EMPLOYEE_FOOTPRINT.height,
  };
}

export function officeRectsOverlap(
  left: OfficeRect,
  right: OfficeRect,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export const DEFAULT_OFFICE_AVATAR_SRC = '/agent-os/avatars/default.png';

export const OFFICE_ZONES: readonly OfficeZone[] = [
  {
    id: 'desks',
    label: '직원 업무 공간',
    hitRegion: { x: 4, y: 8, width: 58, height: 58 },
  },
  {
    id: 'meeting',
    label: '승인 및 협업 공간',
    hitRegion: { x: 64, y: 8, width: 32, height: 38 },
  },
  {
    id: 'waiting',
    label: '대기 공간',
    hitRegion: { x: 4, y: 68, width: 58, height: 27 },
  },
  {
    id: 'lounge',
    label: '공용 라운지',
    hitRegion: { x: 64, y: 50, width: 32, height: 45 },
  },
] as const;

const waitingPoints: readonly OfficePoint[] = [
  { x: 20, y: 64 },
  { x: 36, y: 64 },
  { x: 52, y: 64 },
  { x: 68, y: 64 },
  { x: 20, y: 84 },
  { x: 36, y: 84 },
  { x: 52, y: 84 },
] as const;

const blockedPoints: readonly OfficePoint[] = [
  { x: 82, y: 14 },
  { x: 94, y: 14 },
  { x: 82, y: 34 },
  { x: 94, y: 34 },
  { x: 82, y: 54 },
  { x: 94, y: 54 },
  { x: 82, y: 74 },
] as const;

const knownDeskPoints: readonly OfficePoint[] = [
  { x: 20, y: 18 },
  { x: 36, y: 18 },
  { x: 52, y: 18 },
  { x: 20, y: 40 },
  { x: 36, y: 40 },
  { x: 52, y: 40 },
  { x: 68, y: 29 },
] as const;

function createSeat(input: {
  employeeType: string;
  index: number;
  desk: OfficePoint;
  avatarFile: string;
}): OfficeSeat {
  return {
    id: `seat-${input.employeeType}`,
    employeeType: input.employeeType,
    avatarSrc: `/agent-os/avatars/${input.avatarFile}`,
    desk: input.desk,
    idle: { x: input.desk.x + 2, y: input.desk.y + 2 },
    waiting: waitingPoints[input.index],
    blocked: blockedPoints[input.index],
    paths: {
      working: [{ x: 49, y: 53 }],
      idle: [{ x: 49, y: 53 }],
      waiting: [{ x: 49, y: 68 }],
      blocked: [{ x: 62, y: 47 }],
    },
  };
}

export const OFFICE_SEATS: readonly OfficeSeat[] = [
  createSeat({
    employeeType: 'manager',
    index: 0,
    desk: knownDeskPoints[0],
    avatarFile: 'manager.png',
  }),
  createSeat({
    employeeType: 'ad_strategy',
    index: 1,
    desk: knownDeskPoints[1],
    avatarFile: 'ad-strategy.png',
  }),
  createSeat({
    employeeType: 'chat',
    index: 2,
    desk: knownDeskPoints[2],
    avatarFile: 'chat.png',
  }),
  createSeat({
    employeeType: 'sourcing',
    index: 3,
    desk: knownDeskPoints[3],
    avatarFile: 'sourcing.png',
  }),
  createSeat({
    employeeType: 'listing',
    index: 4,
    desk: knownDeskPoints[4],
    avatarFile: 'listing.png',
  }),
  createSeat({
    employeeType: 'order',
    index: 5,
    desk: knownDeskPoints[5],
    avatarFile: 'order.png',
  }),
  createSeat({
    employeeType: 'channel_registration',
    index: 6,
    desk: knownDeskPoints[6],
    avatarFile: 'channel-registration.png',
  }),
] as const;

const knownSeatByType = new Map(
  OFFICE_SEATS.map((seat) => [seat.employeeType, seat]),
);

function overflowSeat(agentType: string, index: number): OfficeSeat {
  const ordinal = Math.max(0, index - OFFICE_SEATS.length);
  const desk = {
    x: 12 + (ordinal % 5) * 10,
    y: 91 + Math.floor(ordinal / 5) * 4,
  };

  return {
    id: `seat-overflow-${agentType}-${ordinal}`,
    employeeType: agentType,
    avatarSrc: DEFAULT_OFFICE_AVATAR_SRC,
    desk,
    idle: desk,
    waiting: desk,
    blocked: desk,
    paths: {},
  };
}

export function getOfficeSeat(agentType: string, index: number): OfficeSeat {
  return knownSeatByType.get(agentType) ?? overflowSeat(agentType, index);
}

export function getOfficeDestination(
  seat: OfficeSeat,
  status: AgentOfficeNodeStatus,
): OfficePoint {
  if (status === 'idle') return seat.idle;
  if (status === 'waiting') return seat.waiting;
  if (status === 'blocked') return seat.blocked;
  return seat.desk;
}

export function getOfficeMotionPoints(input: {
  seat: OfficeSeat;
  fromStatus: AgentOfficeNodeStatus;
  toStatus: AgentOfficeNodeStatus;
}): OfficePoint[] {
  return [
    getOfficeDestination(input.seat, input.fromStatus),
    ...(input.seat.paths[input.toStatus] ?? []),
    getOfficeDestination(input.seat, input.toStatus),
  ];
}
