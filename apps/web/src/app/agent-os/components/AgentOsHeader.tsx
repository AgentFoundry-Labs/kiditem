'use client';

import Link from 'next/link';
import {
  BarChart3, ChevronDown, Cpu, Home, Layers, Package,
  RotateCcw, Search, Settings, Shield, Zap,
} from 'lucide-react';
import AgentFace from '@/components/AgentFace';

interface Props {
  ceoName: string | null;
  onRefresh: () => void;
}

export function AgentOsHeader({ ceoName, onRefresh }: Props) {
  return (
    <header className="shrink-0 px-5 pt-4 pb-3 flex items-center justify-between gap-3">
      <Link
        href="/"
        className="flex items-center gap-2.5 h-11 px-3.5 rounded-2xl bg-[#111827] border border-white/10 hover:bg-white/[0.04] transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
          <Zap size={14} className="text-white" />
        </div>
        <span className="text-[14px] font-bold">Agent OS</span>
      </Link>

      <nav className="flex items-center gap-1 h-11 px-1.5 rounded-full bg-[#111827] border border-white/10">
        <Link href="/" className="w-9 h-9 rounded-full hover:bg-white/[0.04] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <Home size={15} />
        </Link>
        <div className="h-9 px-3.5 rounded-full bg-white/[0.08] flex items-center gap-1.5 text-white">
          <Shield size={13} />
          <span className="text-[12px] font-semibold">Agents</span>
        </div>
        <Link href="/dashboard" className="w-9 h-9 rounded-full hover:bg-white/[0.04] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <Cpu size={15} />
        </Link>
        <Link href="/sales-analysis" className="w-9 h-9 rounded-full hover:bg-white/[0.04] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <BarChart3 size={15} />
        </Link>
        <Link href="/orders" className="w-9 h-9 rounded-full hover:bg-white/[0.04] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <Package size={15} />
        </Link>
        <Link href="/inventory" className="w-9 h-9 rounded-full hover:bg-white/[0.04] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <Layers size={15} />
        </Link>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <Link href="/settings" className="w-9 h-9 rounded-full hover:bg-white/[0.04] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <Settings size={15} />
        </Link>
      </nav>

      <div className="flex items-center gap-2">
        <button className="w-11 h-11 rounded-2xl bg-[#111827] border border-white/10 hover:bg-white/[0.04] flex items-center justify-center text-slate-400 transition-colors">
          <Search size={15} />
        </button>
        <button
          onClick={onRefresh}
          className="w-11 h-11 rounded-2xl bg-[#111827] border border-white/10 hover:bg-white/[0.04] flex items-center justify-center text-slate-400 transition-colors"
        >
          <RotateCcw size={15} />
        </button>
        <div className="flex items-center gap-2.5 h-11 pl-2 pr-3 rounded-2xl bg-[#111827] border border-white/10">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 flex items-center justify-center overflow-hidden">
            <AgentFace color="violet" role="ceo" size={32} />
          </div>
          <div className="text-right">
            <div className="text-[12px] font-semibold text-slate-200 leading-tight">{ceoName ?? 'CEO Agent'}</div>
            <div className="text-[9px] text-slate-500 leading-tight">Operation Manager</div>
          </div>
          <ChevronDown size={13} className="text-slate-500" />
        </div>
      </div>
    </header>
  );
}
