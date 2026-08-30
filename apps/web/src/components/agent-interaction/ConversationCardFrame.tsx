import type { ReactNode } from 'react';

export interface ConversationCardFrameProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  tone?: 'neutral' | 'approval' | 'success' | 'warning';
  children?: ReactNode;
  actions?: ReactNode;
  ariaLabel?: string;
}

const toneClasses = {
  neutral: 'border-border bg-card',
  approval: 'border-amber-300 bg-amber-50',
  success: 'border-emerald-200 bg-evidence-surface',
  warning: 'border-amber-300 bg-amber-50',
} as const;

/** Presentation-only frame for business projections inside the message lane. */
export function ConversationCardFrame({
  icon,
  title,
  subtitle,
  tone = 'neutral',
  children,
  actions,
  ariaLabel,
}: ConversationCardFrameProps) {
  return (
    <article
      data-conversation-card
      aria-label={ariaLabel ?? title}
      className={`rounded-lg border p-3 text-sm ${toneClasses[tone]}`}
    >
      <header className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background text-primary" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{title}</h3>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </header>
      {children ? <div className="mt-3">{children}</div> : null}
      {actions ? <div className="mt-3">{actions}</div> : null}
    </article>
  );
}
