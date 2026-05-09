'use client';

import Link from 'next/link';
import { Bot, BarChart3, Zap, ArrowRight } from 'lucide-react';

export default function HubPage() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute -right-40 -bottom-40 h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[300px] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      {/* Grid overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div className="relative z-10 flex flex-col items-center gap-12 px-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Zap size={22} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Kiditem <span className="text-cyan-400">OS</span>
            </h1>
          </div>
          <p className="text-sm text-slate-500 font-mono tracking-wide">SELECT YOUR WORKSPACE</p>
        </div>

        {/* Two cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
          {/* Agent OS */}
          <Link
            href="/agent-os"
            className="group relative rounded-2xl border border-cyan-500/20 bg-slate-900/80 backdrop-blur-xl p-8 text-left transition-all duration-300 hover:border-cyan-400/40 hover:shadow-[0_0_40px_rgba(6,182,212,0.15)] hover:scale-[1.02]"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-t-2xl" />
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-5">
              <Bot size={28} className="text-cyan-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Agent OS</h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Agent 네트워크와 실행 도구, 실시간 작업 상태 확인
            </p>
            <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold">
              <span>진입</span>
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Dashboard */}
          <Link
            href="/dashboard"
            className="group relative rounded-2xl border border-purple-500/20 bg-slate-900/80 backdrop-blur-xl p-8 text-left transition-all duration-300 hover:border-purple-400/40 hover:shadow-[0_0_40px_rgba(168,85,247,0.15)] hover:scale-[1.02]"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-t-2xl" />
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-5">
              <BarChart3 size={28} className="text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Dashboard</h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              매출 KPI, 광고 분석, 상품 파이프라인, 데이터 수집
            </p>
            <div className="flex items-center gap-2 text-purple-400 text-sm font-semibold">
              <span>진입</span>
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>

        <p className="text-xs text-slate-600 font-mono">KidItem Workflow AutoSystem</p>
      </div>
    </div>
  );
}
