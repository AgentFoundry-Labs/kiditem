'use client';

import { ShieldCheck } from 'lucide-react';
import { MALL_AGENT_PRINCIPLES } from '../lib/mall-agent-missions';

/** 에이전트가 무엇을 하든 지키는 원칙. */
export function PrinciplesSection() {
  return (
    <section id="mall-principles" className="card scroll-mt-6">
      <h2 className="section-title flex items-center gap-1.5">
        <ShieldCheck size={15} className="text-slate-500" />
        지키는 원칙
      </h2>
      <ul className="mt-3 space-y-2">
        {MALL_AGENT_PRINCIPLES.map((principle) => (
          <li key={principle} className="flex items-start gap-2 text-sm text-slate-600">
            <span aria-hidden className="mt-2 h-1 w-1 flex-none rounded-full bg-slate-400" />
            {principle}
          </li>
        ))}
      </ul>
    </section>
  );
}
