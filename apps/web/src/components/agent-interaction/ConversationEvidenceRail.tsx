import type { ReactNode } from 'react';

/** Presentation-only grouping for business results inside an assistant lane. */
export function ConversationEvidenceRail({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="업무 증거"
      className="rounded-xl border border-emerald-200 bg-evidence-surface p-3"
    >
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-emerald-900">업무 증거</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
