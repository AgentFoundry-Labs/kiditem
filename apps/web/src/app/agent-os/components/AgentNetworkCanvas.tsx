'use client';

import { useCallback, useRef, useState } from 'react';
import { Maximize2, Move, ZoomIn, ZoomOut } from 'lucide-react';
import AgentFace from '@/components/AgentFace';
import { cn } from '@/lib/utils';
import { CATEGORY_FACE, type OrgNode, type TeamStyle } from '../lib/agent-os-types';

interface Props {
  ceo: OrgNode | undefined;
  teams: OrgNode[];
  teamStyle: Record<string, TeamStyle>;
  teamTaskCounts: Record<string, number>;
  selectedAgent: string | null;
  onSelect: (id: string) => void;
}

export function AgentNetworkCanvas({
  ceo, teams, teamStyle, teamTaskCounts, selectedAgent, onSelect,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.7);
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, [role="button"]');
    if (e.button === 1 || (e.button === 0 && !isInteractive)) {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    }
  }, [pan]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy });
  }, []);

  const handleCanvasMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(z => Math.min(2.5, Math.max(0.3, z + delta)));
  }, []);

  const resetView = useCallback(() => { setPan({ x: 0, y: 0 }); setZoom(0.7); }, []);

  return (
    <>
      <main
        ref={canvasRef}
        className={cn('absolute inset-0 overflow-hidden', dragRef.current ? 'cursor-grabbing' : 'cursor-grab')}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        onWheel={handleWheel}
      >
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x % (24 * zoom)}px ${pan.y % (24 * zoom)}px`,
        }} />

        <div
          className="absolute flex flex-col items-center origin-center select-none"
          style={{
            top: '50%',
            left: '50%',
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            willChange: 'transform',
          }}
        >
          <button onClick={() => ceo && onSelect(ceo.id)}
            className={cn(
              'flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all',
              selectedAgent === ceo?.id ? 'border-violet-400/40 bg-violet-500/10 ring-1 ring-violet-400/20' : 'border-violet-500/15 bg-violet-500/5 hover:border-violet-500/25',
            )}>
            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-violet-400/20" style={{ background: 'rgba(139,92,246,0.08)' }}>
              <AgentFace color="violet" role="ceo" size={44} />
            </div>
            <div className="text-left">
              <div className="text-[14px] font-bold">{ceo?.name || 'CEO Agent'}</div>
              <div className="text-[10px] text-violet-400 font-mono tracking-wider">COMMANDER</div>
            </div>
            <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', ceo?.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')} />
          </button>

          <div className="w-px h-8 bg-gradient-to-b from-violet-500/30 to-white/10" />

          <div className="relative" style={{ width: teams.length * 190 }}>
            <div className="absolute top-0 left-[10%] right-[10%] h-px bg-white/10" />
            <div className="flex justify-between px-[10%]">
              {teams.map(t => {
                const st = teamStyle[t.category || ''];
                return <div key={t.id} className="w-2 h-2 rounded-full -mt-1" style={{ background: st?.color || '#64748b', opacity: 0.7 }} />;
              })}
            </div>
          </div>

          <div className="flex justify-center gap-3" style={{ width: teams.length * 190 }}>
            {teams.map(team => {
              const style = teamStyle[team.category || ''];
              if (!style) return null;
              const teamAgents = team.reports ?? [];
              const taskCount = teamTaskCounts[team.category || ''] ?? 0;
              const TeamIcon = style.icon;
              return (
                <div key={team.id} className="flex flex-col items-center" style={{ width: 176 }}>
                  <div className="w-px h-6" style={{ background: `${style.color}30` }} />
                  <div className="w-full rounded-xl border p-3 mb-1.5" style={{ borderColor: `${style.color}25`, background: `${style.color}06` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <TeamIcon size={14} style={{ color: style.color }} />
                      <span className="text-[13px] font-bold" style={{ color: style.color }}>{style.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-600">
                      <span>{teamAgents.length} agents</span>
                      {taskCount > 0 && <span style={{ color: style.color }}>{taskCount}t</span>}
                    </div>
                  </div>
                  {teamAgents.length > 0 && <div className="w-px h-3" style={{ background: `${style.color}20` }} />}
                  <div className="w-full space-y-1.5">
                    {teamAgents.map((agent, idx) => {
                      const isRunning = agent.status === 'running';
                      const isSelected = selectedAgent === agent.id;
                      return (
                        <div key={agent.id}>
                          {idx > 0 && <div className="flex justify-center"><div className="w-px h-1.5" style={{ background: `${style.color}15` }} /></div>}
                          <button
                            onClick={() => onSelect(agent.id)}
                            className={cn(
                              'w-full rounded-lg border p-2.5 text-left transition-all',
                              isSelected ? 'bg-white/[0.06] ring-1' : 'border-white/[0.06] bg-[#111827] hover:bg-white/[0.04]',
                            )}
                            style={isSelected ? { borderColor: `${style.color}40`, boxShadow: `0 0 20px ${style.color}08, 0 0 0 1px ${style.color}25` } : undefined}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 relative" style={{ background: `${style.color}10` }}>
                                <AgentFace color={CATEGORY_FACE[team.category || ''] || 'blue'} role={agent.role} size={36} />
                                <div className={cn(
                                  'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#111827]',
                                  isRunning ? 'bg-emerald-400' : agent.lastHeartbeatAt ? 'bg-slate-600' : 'bg-slate-800',
                                )} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-semibold truncate">{agent.name}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {isRunning ? (
                                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                                      <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />실행 중
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-700">대기</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#111827]/90 backdrop-blur-lg border border-white/10 rounded-xl px-2 py-1.5 z-10">
          <button onClick={() => setZoom(z => Math.min(2.5, z + 0.15))} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10"><ZoomIn size={14} /></button>
          <div className="text-[10px] font-mono text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</div>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10"><ZoomOut size={14} /></button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button onClick={resetView} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10"><Maximize2 size={14} /></button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <div className="flex items-center gap-1 text-[9px] text-slate-600"><Move size={10} /><span>drag to pan</span></div>
        </div>
      </main>
    </>
  );
}
