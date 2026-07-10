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
  { x: 12, y: 78 },
  { x: 22, y: 78 },
  { x: 32, y: 78 },
  { x: 42, y: 78 },
  { x: 52, y: 78 },
  { x: 27, y: 88 },
  { x: 47, y: 88 },
] as const;

const blockedPoints: readonly OfficePoint[] = [
  { x: 71, y: 23 },
  { x: 79, y: 18 },
  { x: 87, y: 23 },
  { x: 71, y: 33 },
  { x: 79, y: 38 },
  { x: 87, y: 33 },
  { x: 79, y: 28 },
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
    idle: { x: input.desk.x, y: input.desk.y + 9 },
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
    desk: { x: 14, y: 20 },
    avatarFile: 'manager.png',
  }),
  createSeat({
    employeeType: 'ad_strategy',
    index: 1,
    desk: { x: 31, y: 20 },
    avatarFile: 'ad-strategy.png',
  }),
  createSeat({
    employeeType: 'chat',
    index: 2,
    desk: { x: 48, y: 20 },
    avatarFile: 'chat.png',
  }),
  createSeat({
    employeeType: 'sourcing',
    index: 3,
    desk: { x: 14, y: 49 },
    avatarFile: 'sourcing.png',
  }),
  createSeat({
    employeeType: 'listing',
    index: 4,
    desk: { x: 31, y: 49 },
    avatarFile: 'listing.png',
  }),
  createSeat({
    employeeType: 'order',
    index: 5,
    desk: { x: 48, y: 49 },
    avatarFile: 'order.png',
  }),
  createSeat({
    employeeType: 'channel_registration',
    index: 6,
    desk: { x: 58, y: 35 },
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
