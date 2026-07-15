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
    <header
      data-testid="agent-os-header"
      className="flex shrink-0 items-center justify-between gap-3 px-3 pb-3 pt-4 sm:px-5"
    >
      <Link
        href="/"
        className="flex h-11 shrink-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-[#111827] px-3.5 transition-colors hover:bg-white/[0.04]"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500">
          <Zap size={14} className="text-white" />
        </div>
        <span className="text-[14px] font-bold">Agent OS</span>
      </Link>

      <nav
        data-testid="agent-os-header-nav"
        className="hidden h-11 items-center gap-1 rounded-full border border-white/10 bg-[#111827] px-1.5 md:flex"
      >
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white">
          <Home size={15} />
        </Link>
        <div className="flex h-9 items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 text-white">
          <Shield size={13} />
          <span className="text-[12px] font-semibold">Agents</span>
        </div>
        <Link href="/dashboard" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white">
          <Cpu size={15} />
        </Link>
        <Link href="/sales-analysis" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white">
          <BarChart3 size={15} />
        </Link>
        <Link href="/order-hub" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white">
          <Package size={15} />
        </Link>
        <Link href="/inventory-hub" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white">
          <Layers size={15} />
        </Link>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <Link href="/settings" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white">
          <Settings size={15} />
        </Link>
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <button className="hidden h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#111827] text-slate-400 transition-colors hover:bg-white/[0.04] sm:flex">
          <Search size={15} />
        </button>
        <button
          onClick={onRefresh}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#111827] text-slate-400 transition-colors hover:bg-white/[0.04]"
        >
          <RotateCcw size={15} />
        </button>
        <div className="flex h-11 items-center gap-2.5 rounded-2xl border border-white/10 bg-[#111827] pl-2 pr-2 sm:pr-3">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500">
            <AgentFace color="violet" role="ceo" size={32} />
          </div>
          <div className="hidden text-right lg:block">
            <div className="text-[12px] font-semibold text-slate-200 leading-tight">{ceoName ?? 'CEO Agent'}</div>
            <div className="text-[9px] text-slate-500 leading-tight">Operation Manager</div>
          </div>
          <ChevronDown size={13} className="text-slate-500" />
        </div>
      </div>
    </header>
  );
}
