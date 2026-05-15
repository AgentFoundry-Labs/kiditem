import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistrationWorkspaceSummary } from '../../_shared/lib/registration-workspaces-api';
import { RegisteredWorkspaceCard } from './RegisteredWorkspaceCard';

function workspaceFixture(overrides: Partial<RegistrationWorkspaceSummary> = {}): RegistrationWorkspaceSummary {
  return {
    id: 'workspace-1',
    ownerType: 'source_candidate',
    sourceCandidateId: 'candidate-1',
    targetMasterId: null,
    displayName: 'QA Detail Panel',
    normalizedTitle: 'qadetailpanel',
    status: 'active',
    href: '/product-pipeline/registered-products/workspace-1',
    generationCount: 1,
    latestGenerationId: 'generation-1',
    latestStatus: 'completed',
    currentDetailPageArtifactId: 'artifact-1',
    currentDetailPageRevisionId: 'revision-1',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    history: [{
      id: 'generation-1',
      contentType: 'detail_page',
      status: 'completed',
      generatedTitle: 'QA Detail Panel',
      templateId: 'kids-playful',
      generationInput: {
        rawTitle: 'QA Detail Panel',
        imageUrls: ['https://cdn.example.com/product.jpg'],
      },
      detailPageArtifactId: 'artifact-1',
      href: '/product-pipeline/detail-pages/generation-1/editor',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    }],
    ...overrides,
  };
}

describe('RegisteredWorkspaceCard routing actions', () => {
  it('opens the workspace detail when the card body is clicked', () => {
    const workspace = workspaceFixture();
    const onOpen = vi.fn();

    render(
      <RegisteredWorkspaceCard
        workspace={workspace}
        isDeleting={false}
        onOpen={onOpen}
        onOpenThumbnailEditor={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('heading', { name: 'QA Detail Panel' }));

    expect(onOpen).toHaveBeenCalledWith(workspace);
  });

  it('keeps the detail action on the workspace detail route instead of jumping straight into the editor', () => {
    const workspace = workspaceFixture();
    const onOpen = vi.fn();

    render(
      <RegisteredWorkspaceCard
        workspace={workspace}
        isDeleting={false}
        onOpen={onOpen}
        onOpenThumbnailEditor={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '상세' }));

    expect(onOpen).toHaveBeenCalledWith(workspace);
  });

  it('opens a workspace even when it has no detail-page history yet', () => {
    const workspace = workspaceFixture({
      generationCount: 0,
      latestGenerationId: null,
      latestStatus: null,
      currentDetailPageArtifactId: null,
      currentDetailPageRevisionId: null,
      history: [],
    });
    const onOpen = vi.fn();

    render(
      <RegisteredWorkspaceCard
        workspace={workspace}
        isDeleting={false}
        onOpen={onOpen}
        onOpenThumbnailEditor={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '상세' }));

    expect(screen.getByRole('heading', { name: 'QA Detail Panel' })).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledWith(workspace);
  });

  it('does not render an editor shortcut for an empty workspace', () => {
    render(
      <RegisteredWorkspaceCard
        workspace={workspaceFixture({
          generationCount: 0,
          latestGenerationId: null,
          latestStatus: null,
          currentDetailPageArtifactId: null,
          currentDetailPageRevisionId: null,
          history: [],
        })}
        isDeleting={false}
        onOpen={vi.fn()}
        onOpenThumbnailEditor={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '에디터' })).not.toBeInTheDocument();
  });

  it('selects a card without opening the workspace', () => {
    const workspace = workspaceFixture();
    const onOpen = vi.fn();
    const onSelectedChange = vi.fn();

    render(
      <RegisteredWorkspaceCard
        workspace={workspace}
        isDeleting={false}
        selected={false}
        onOpen={onOpen}
        onSelectedChange={onSelectedChange}
        onOpenThumbnailEditor={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'QA Detail Panel 선택' }));

    expect(onSelectedChange).toHaveBeenCalledWith(workspace.id, true);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
