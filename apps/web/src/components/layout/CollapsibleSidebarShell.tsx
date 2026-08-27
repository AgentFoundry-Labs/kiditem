import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CollapsibleSidebarShellProps {
  expanded: boolean;
  mobile: boolean;
  mobileOpen: boolean;
  desktopBreakpoint?: 'md' | 'lg';
  home: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
  onDesktopToggle?: () => void;
  onMobileOpenChange?: (open: boolean) => void;
}

const controlClassName = [
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md',
  'text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2',
  'md:min-h-10 md:min-w-10',
].join(' ');

export function CollapsibleSidebarShell({
  expanded,
  mobile,
  mobileOpen,
  desktopBreakpoint = 'md',
  home,
  body,
  footer,
  onDesktopToggle,
  onMobileOpenChange,
}: CollapsibleSidebarShellProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileOpenControlRef = useRef<HTMLButtonElement>(null);
  const wasMobileOpenRef = useRef(false);
  const wideHeader = mobile || expanded;
  const desktopClasses = desktopBreakpoint === 'lg'
    ? {
      hiddenOnMobile: 'lg:hidden',
      translate: 'lg:translate-x-0',
      expandedWidth: 'lg:w-[256px]',
      collapsedWidth: 'lg:w-[64px]',
    }
    : {
      hiddenOnMobile: 'md:hidden',
      translate: 'md:translate-x-0',
      expandedWidth: 'md:w-[256px]',
      collapsedWidth: 'md:w-[64px]',
    };
  const desktopControlLabel = expanded ? '사이드바 접기' : '사이드바 펼치기';
  const controlLabel = mobile ? '메뉴 닫기' : desktopControlLabel;
  const controlAction = mobile
    ? () => onMobileOpenChange?.(false)
    : onDesktopToggle;
  const mobileDrawerHidden = mobile && !mobileOpen;

  useEffect(() => {
    if (!mobile) {
      wasMobileOpenRef.current = false;
      return;
    }

    if (mobileOpen) {
      wasMobileOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        sidebarRef.current
          ?.querySelector<HTMLButtonElement>('[data-sidebar-toggle="close-drawer"]')
          ?.focus();
      });

      return () => window.cancelAnimationFrame(frame);
    }

    if (wasMobileOpenRef.current) {
      wasMobileOpenRef.current = false;
      mobileOpenControlRef.current?.focus();
    }
  }, [mobile, mobileOpen]);

  return (
    <>
      {mobile && mobileOpen && onMobileOpenChange && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => onMobileOpenChange(false)}
        />
      )}
      {mobile && !mobileOpen && onMobileOpenChange && (
        <button
          type="button"
          aria-label="메뉴 열기"
          title="메뉴 열기"
          className={cn(
            controlClassName,
            'fixed left-3 top-3 z-40 bg-[var(--surface)] shadow-sm',
            desktopClasses.hiddenOnMobile,
          )}
          onClick={() => onMobileOpenChange(true)}
          ref={mobileOpenControlRef}
        >
          <Menu aria-hidden="true" size={19} />
        </button>
      )}
      <aside
        ref={sidebarRef}
        data-testid="collapsible-sidebar-shell"
        data-desktop-width={expanded ? '256' : '64'}
        aria-label="KidItem navigation"
        aria-hidden={mobileDrawerHidden || undefined}
        inert={mobileDrawerHidden || undefined}
        onKeyDown={(event) => {
          if (mobile && mobileOpen && event.key === 'Escape') {
            event.preventDefault();
            onMobileOpenChange?.(false);
          }
        }}
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-[256px] flex-col overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--surface)] font-sans',
          'transition-[width,transform] duration-150 motion-reduce:transition-none',
          desktopClasses.translate,
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          expanded ? desktopClasses.expandedWidth : desktopClasses.collapsedWidth,
        )}
      >
        <header
          className={cn(
            'shrink-0 border-b border-[var(--border-subtle)]',
            wideHeader
              ? 'flex h-14 items-center justify-between gap-2 px-4'
              : 'flex min-h-[104px] flex-col items-center gap-1 py-2',
          )}
        >
          <div
            data-sidebar-home
            className="flex min-h-11 min-w-11 items-center justify-center md:min-h-10 md:min-w-10"
          >
            {home}
          </div>
          {controlAction && (
            <button
              type="button"
              data-sidebar-toggle={mobile ? 'close-drawer' : expanded ? 'collapse' : 'expand'}
              aria-label={controlLabel}
              aria-expanded={mobile ? mobileOpen : expanded}
              title={controlLabel}
              className={controlClassName}
              onClick={controlAction}
            >
              {mobile || expanded
                ? <PanelLeftClose aria-hidden="true" size={19} />
                : <PanelLeftOpen aria-hidden="true" size={19} />}
            </button>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </aside>
    </>
  );
}
