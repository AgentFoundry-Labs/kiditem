import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadyGenerationSection } from './ReadyGenerationSection';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('../../_shared/hooks/useThumbnailGenerations', () => ({
  useReEditGeneration: () => ({ mutate: vi.fn() }),
}));

describe('ReadyGenerationSection', () => {
  it('sends AI edit links back to the thumbnail AI dashboard', () => {
    render(
      <ReadyGenerationSection
        generations={[
          {
            id: 'generation-1',
            contentWorkspaceId: 'workspace-1',
            contentWorkspace: {
              name: '할로윈 호박머리띠',
              imageUrl: 'https://cdn.example.com/original.jpg',
            },
            candidates: ['https://cdn.example.com/generated.jpg'],
            status: 'ready',
            createdAt: '2026-05-18T00:00:00.000Z',
          } as never,
        ]}
        wingRegisteringIds={new Set()}
        onSelectCandidate={vi.fn()}
        onOpenCoupangEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const href = screen.getByRole('link', { name: /AI 편집하기/ }).getAttribute('href');

    expect(href).toContain('/product-pipeline/thumbnail-generation/edit?');
    expect(decodeURIComponent(href ?? '')).toContain('returnTo=/product-pipeline/thumbnail-ai');
  });
});
