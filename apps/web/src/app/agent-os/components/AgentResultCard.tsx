'use client';

import { ExternalLink, ShoppingCart, Sparkles } from 'lucide-react';
import type { AgentOsArtifact } from '../lib/agent-os-types';

function summaryText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function summaryNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function AgentResultCard({
  artifact,
  onCreateDraft,
  draftPending = false,
}: {
  artifact: AgentOsArtifact;
  onCreateDraft?: (artifactId: string) => void;
  draftPending?: boolean;
}) {
  const score = summaryNumber(artifact.summary.score);
  const action = summaryText(artifact.summary.action);
  const reason = summaryText(artifact.summary.reason);
  const canCreateDraft =
    artifact.artifactType === 'sourcing_recommendation' && onCreateDraft;

  return (
    <article className="rounded-lg border border-white/10 bg-[#101827] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-white">
                {artifact.title}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {score !== null ? `Score ${score}` : artifact.artifactType}
                {action ? ` · ${action}` : ''}
              </p>
            </div>
            {artifact.href ? (
              <a
                href={artifact.href}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:border-cyan-300 hover:text-cyan-200"
                aria-label="결과 열기"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          {reason ? (
            <p className="mt-3 text-sm leading-6 text-slate-300">{reason}</p>
          ) : null}
        </div>
      </div>
      {canCreateDraft ? (
        <button
          type="button"
          onClick={() => onCreateDraft(artifact.id)}
          disabled={draftPending}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300/40 px-3 text-xs font-semibold text-amber-200 hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          발주 초안
        </button>
      ) : null}
    </article>
  );
}
