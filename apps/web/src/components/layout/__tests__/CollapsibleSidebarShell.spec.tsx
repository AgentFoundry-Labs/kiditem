import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('CollapsibleSidebarShell', () => {
  it('uses the shared 256px expanded and 64px collapsed desktop geometry with labelled controls', async () => {
    const { CollapsibleSidebarShell } = await import('../CollapsibleSidebarShell');
    const onDesktopToggle = vi.fn();
    const onMobileOpenChange = vi.fn();
    const home = <a aria-label="KidItem 홈" href="/">KidItem</a>;
    const body = <nav aria-label="Dashboard navigation">Dashboard navigation</nav>;
    const footer = <button type="button">AI 챗</button>;

    const view = render(
      <CollapsibleSidebarShell
        expanded
        mobile={false}
        mobileOpen={false}
        home={home}
        body={body}
        footer={footer}
        onDesktopToggle={onDesktopToggle}
        onMobileOpenChange={onMobileOpenChange}
      />,
    );

    const shell = screen.getByTestId('collapsible-sidebar-shell');
    const collapse = screen.getByRole('button', { name: '사이드바 접기' });
    expect(shell).toHaveAttribute('data-desktop-width', '256');
    expect(shell).toHaveClass(
      'md:w-[256px]',
      'transition-[width,transform]',
      'duration-150',
      'motion-reduce:transition-none',
    );
    expect(collapse).toHaveAttribute('title', '사이드바 접기');
    expect(collapse).toHaveClass('min-h-11', 'min-w-11', 'md:min-h-10', 'md:min-w-10');
    expect(screen.getByRole('navigation', { name: 'Dashboard navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI 챗' })).toBeInTheDocument();

    fireEvent.click(collapse);
    expect(onDesktopToggle).toHaveBeenCalledTimes(1);

    view.rerender(
      <CollapsibleSidebarShell
        expanded={false}
        mobile={false}
        mobileOpen={false}
        home={home}
        body={body}
        footer={footer}
        onDesktopToggle={onDesktopToggle}
        onMobileOpenChange={onMobileOpenChange}
      />,
    );

    const expand = screen.getByRole('button', { name: '사이드바 펼치기' });
    expect(shell).toHaveAttribute('data-desktop-width', '64');
    expect(shell).toHaveClass('md:w-[64px]');
    expect(screen.getByRole('link', { name: 'KidItem 홈' })).not.toBe(expand);
    expect(expand).toHaveAttribute('title', '사이드바 펼치기');
  });

  it('uses an independent 44px mobile drawer control without changing the desktop action', async () => {
    const { CollapsibleSidebarShell } = await import('../CollapsibleSidebarShell');
    const onDesktopToggle = vi.fn();
    const onMobileOpenChange = vi.fn();

    render(
      <CollapsibleSidebarShell
        expanded={false}
        mobile
        mobileOpen={false}
        home={<a aria-label="KidItem 홈" href="/">KidItem</a>}
        body={<nav aria-label="Dashboard navigation">Dashboard navigation</nav>}
        onDesktopToggle={onDesktopToggle}
        onMobileOpenChange={onMobileOpenChange}
      />,
    );

    const openDrawer = screen.getByRole('button', { name: '메뉴 열기' });
    expect(openDrawer).toHaveClass('min-h-11', 'min-w-11', 'md:min-h-10', 'md:min-w-10');

    fireEvent.click(openDrawer);
    expect(onMobileOpenChange).toHaveBeenCalledWith(true);
    expect(onDesktopToggle).not.toHaveBeenCalled();
  });

  it('stays presentation-only and does not own Dashboard menu, runtime, query, or provider state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/layout/CollapsibleSidebarShell.tsx'),
      'utf8',
    );

    expect(source).not.toContain('sidebar-menu');
    expect(source).not.toContain('useStore');
    expect(source).not.toContain('Conversation');
    expect(source).not.toContain('useQuery');
    expect(source).not.toContain('Provider');
  });
});
