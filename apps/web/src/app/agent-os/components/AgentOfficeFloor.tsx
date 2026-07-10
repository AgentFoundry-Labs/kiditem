'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  OFFICE_SEATS,
  OFFICE_ZONES,
  type OfficeRect,
  type OfficeSeat,
} from '../lib/agent-office-layout';
import type { AgentOfficeNode } from '../lib/agent-office-model';

// Scene composition follows the MIT-licensed SVG floor-plan approach used by
// OpenClaw Office. KidItem owns the room geometry, palette, seats, and behavior.
// Source reference: https://github.com/WW-AI-Lab/openclaw-office

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 750;

export interface AgentOfficeDeskPlacement {
  node: AgentOfficeNode;
  seat: OfficeSeat;
}

function rectStyle(rect: OfficeRect) {
  return {
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
  };
}

function deskRect(seat: OfficeSeat): OfficeRect {
  return {
    x: seat.desk.x - 5,
    y: seat.desk.y - 7,
    width: 10,
    height: 14,
  };
}

function toCanvasX(value: number) {
  return (value / 100) * VIEWBOX_WIDTH;
}

function toCanvasY(value: number) {
  return (value / 100) * VIEWBOX_HEIGHT;
}

function DeskFixture({ seat, active }: { seat: OfficeSeat; active: boolean }) {
  const x = toCanvasX(seat.desk.x);
  const y = toCanvasY(seat.desk.y);

  return (
    <g
      data-testid="office-desk-fixture"
      transform={`translate(${x} ${y})`}
    >
      <rect
        x="-22"
        y="-39"
        width="44"
        height="36"
        rx="8"
        fill="#aebbc9"
        stroke="#7f90a4"
        strokeWidth="2"
      />
      <rect
        x="-51"
        y="-12"
        width="102"
        height="58"
        rx="8"
        fill="#dbe4ee"
        stroke="#91a3b8"
        strokeWidth="2"
      />
      <rect x="-47" y="-8" width="94" height="5" rx="2" fill="#eef3f8" />
      <rect
        x="-20"
        y="-28"
        width="40"
        height="27"
        rx="4"
        fill="#263449"
        stroke="#172235"
        strokeWidth="2"
      />
      <rect
        x="-16"
        y="-24"
        width="32"
        height="19"
        rx="2"
        fill={active ? '#38bdf8' : '#78899d'}
      />
      <rect x="-4" y="0" width="8" height="8" rx="2" fill="#263449" />
      <rect x="-15" y="7" width="30" height="5" rx="2" fill="#263449" />
      <rect
        x="-18"
        y="22"
        width="36"
        height="13"
        rx="4"
        fill="#f8fafc"
        stroke="#9aa9ba"
      />
      <rect x="-42" y="48" width="84" height="7" rx="3" fill="#b9c6d4" />
    </g>
  );
}

function MeetingRoom() {
  const chairs = Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2;
    return {
      x: 966 + Math.cos(angle) * 116,
      y: 205 + Math.sin(angle) * 104,
    };
  });

  return (
    <g>
      <ellipse cx="966" cy="205" rx="145" ry="126" fill="#e2e8f0" />
      <circle
        cx="966"
        cy="205"
        r="73"
        fill="#c9d5e3"
        stroke="#8193a9"
        strokeWidth="3"
      />
      {chairs.map((chair, index) => (
        <g key={index} transform={`translate(${chair.x} ${chair.y})`}>
          <circle r="22" fill="#91a3b8" stroke="#718399" strokeWidth="2" />
          <rect x="-18" y="-29" width="36" height="10" rx="5" fill="#8193a9" />
        </g>
      ))}
      <rect x="938" y="188" width="56" height="35" rx="6" fill="#ffffff" />
      <rect x="946" y="181" width="40" height="28" rx="4" fill="#36445a" />
      <rect x="951" y="186" width="30" height="18" rx="2" fill="#7dd3fc" />
    </g>
  );
}

function WaitingRoom() {
  return (
    <g>
      <rect x="110" y="574" width="190" height="58" rx="8" fill="#b8c5d4" />
      <rect x="118" y="581" width="84" height="38" rx="7" fill="#d6dee8" />
      <rect x="208" y="581" width="84" height="38" rx="7" fill="#d6dee8" />
      <rect x="390" y="574" width="190" height="58" rx="8" fill="#b8c5d4" />
      <rect x="398" y="581" width="84" height="38" rx="7" fill="#d6dee8" />
      <rect x="488" y="581" width="84" height="38" rx="7" fill="#d6dee8" />
      <rect x="286" y="648" width="112" height="38" rx="8" fill="#e8edf3" stroke="#a1afbf" />
      <circle cx="70" cy="665" r="24" fill="#6da477" />
      <rect x="61" y="681" width="18" height="22" rx="5" fill="#9b7653" />
      <circle cx="650" cy="665" r="24" fill="#6da477" />
      <rect x="641" y="681" width="18" height="22" rx="5" fill="#9b7653" />
    </g>
  );
}

function LoungeRoom() {
  return (
    <g>
      <rect x="824" y="430" width="176" height="60" rx="8" fill="#91a3b8" />
      <rect x="833" y="438" width="75" height="43" rx="7" fill="#b9c6d4" />
      <rect x="916" y="438" width="75" height="43" rx="7" fill="#b9c6d4" />
      <rect x="1036" y="470" width="62" height="178" rx="8" fill="#91a3b8" />
      <rect x="1044" y="480" width="46" height="74" rx="7" fill="#b9c6d4" />
      <rect x="1044" y="562" width="46" height="76" rx="7" fill="#b9c6d4" />
      <rect x="838" y="594" width="178" height="60" rx="8" fill="#91a3b8" />
      <rect x="847" y="602" width="75" height="43" rx="7" fill="#b9c6d4" />
      <rect x="930" y="602" width="77" height="43" rx="7" fill="#b9c6d4" />
      <rect
        x="895"
        y="515"
        width="116"
        height="58"
        rx="8"
        fill="#e8edf3"
        stroke="#a1afbf"
        strokeWidth="2"
      />
      <circle cx="810" cy="680" r="22" fill="#6da477" />
      <rect x="802" y="694" width="16" height="20" rx="5" fill="#9b7653" />
      <circle cx="1138" cy="680" r="22" fill="#6da477" />
      <rect x="1130" y="694" width="16" height="20" rx="5" fill="#9b7653" />
    </g>
  );
}

export function AgentOfficeFloor({
  desks,
  onSelectNode,
}: {
  desks: AgentOfficeDeskPlacement[];
  onSelectNode: (id: string) => void;
}) {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const placementBySeatId = useMemo(
    () => new Map(desks.map((placement) => [placement.seat.id, placement])),
    [desks],
  );

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#edf2f7]">
      <svg
        data-testid="office-floor-svg"
        role="img"
        aria-label="상호작용 가능한 Agent OS 사무공간"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <pattern id="office-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <rect width="24" height="24" fill="#edf2f7" />
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#dbe4ee" strokeWidth="1" />
          </pattern>
          <pattern id="office-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#f2eef6" />
            <circle cx="3" cy="3" r="1" fill="#d7cfdf" />
          </pattern>
        </defs>

        <rect x="20" y="20" width="1160" height="710" rx="8" fill="#e7edf4" stroke="#8193a9" strokeWidth="5" />
        <rect x="24" y="36" width="696" height="438" fill="#f7f9fc" stroke="#9aa9ba" strokeWidth="3" />
        <rect x="768" y="36" width="408" height="285" fill="#eef4fb" stroke="#9aa9ba" strokeWidth="3" />
        <rect x="24" y="510" width="696" height="216" fill="#f5f7fa" stroke="#9aa9ba" strokeWidth="3" />
        <rect x="768" y="360" width="408" height="366" fill="url(#office-dots)" stroke="#9aa9ba" strokeWidth="3" />
        <path d="M 720 20 H 768 V 730 H 720 Z M 20 474 H 1180 V 510 H 20 Z" fill="url(#office-grid)" />

        {OFFICE_SEATS.map((seat) => (
          <DeskFixture
            key={seat.id}
            seat={seat}
            active={placementBySeatId.get(seat.id)?.node.status === 'working'}
          />
        ))}
        <MeetingRoom />
        <WaitingRoom />
        <LoungeRoom />
      </svg>

      {OFFICE_ZONES.map((zone) => (
        <button
          key={zone.id}
          type="button"
          aria-label={`${zone.label} 구역`}
          aria-pressed={selectedZoneId === zone.id}
          onClick={() =>
            setSelectedZoneId((current) => (current === zone.id ? null : zone.id))
          }
          style={rectStyle(zone.hitRegion)}
          className={cn(
            'group absolute z-10 border border-transparent text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600',
            'hover:border-slate-400/70',
            selectedZoneId === zone.id && 'border-purple-600/70 bg-purple-50/20',
          )}
        >
          <span className="pointer-events-none absolute left-2 top-2 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
            {zone.label}
          </span>
        </button>
      ))}

      {desks.map(({ node, seat }) => (
        <button
          key={seat.id}
          type="button"
          aria-label={`${node.displayName} 책상`}
          onClick={() => onSelectNode(node.id)}
          style={rectStyle(deskRect(seat))}
          className="absolute z-20 border border-transparent hover:border-purple-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
        />
      ))}
    </div>
  );
}
