import Link from 'next/link';
import type { MouseEventHandler } from 'react';

/** Shared KidItem identity control for the product and conversation sidebars. */
export function SidebarBrandLink({
  href,
  ariaLabel,
  title,
  showLabel,
  onClick,
}: {
  href: string;
  ariaLabel: string;
  title: string;
  showLabel: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      className="flex min-h-11 min-w-11 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 md:min-h-10 md:min-w-10"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]" aria-hidden="true">
        <span className="text-[12px] font-extrabold text-[var(--primary-contrast)]">K</span>
      </span>
      {showLabel ? <span className="text-[16px] font-bold tracking-tight text-[var(--text-primary)]">KidItem</span> : null}
    </Link>
  );
}
