import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionCanvasNode } from '../lib/execution-canvas-graph';
import { ExecutionNodeDetail } from './ExecutionNodeDetail';

const toolNode: ExecutionCanvasNode = {
  id: 'tool:tool-scrape-1',
  sourceId: 'tool-scrape-1',
  laneId: 'sourcing',
  kind: 'tool',
  label: 'Scrape Url',
  eyebrow: 'sourcing_scrape_url',
  description: null,
  status: 'succeeded',
  startedAt: '2026-06-04T00:00:05.000Z',
  finishedAt: '2026-06-04T00:00:09.000Z',
  metadata: {
    capabilityKey: 'sourcing_scrape_url',
    title: '오프로드 장난감 자동차',
    imageCount: '8',
  },
};

const approvalNode: ExecutionCanvasNode = {
  id: 'approval:approval-1',
  sourceId: 'approval-1',
  laneId: 'listing',
  kind: 'approval',
  label: 'User approval required',
  eyebrow: 'channels_submit_coupang_listing',
  description: 'policy_approval_required',
  status: 'waiting_approval',
  startedAt: '2026-06-04T00:00:18.000Z',
  finishedAt: null,
  metadata: {
    approvalRequestId: 'approval-1',
    capabilityKey: 'channels_submit_coupang_listing',
    productName: '오프로드 장난감 자동차',
  },
};

describe('ExecutionNodeDetail', () => {
  it('asks the user to select a node when nothing is selected', () => {
    render(<ExecutionNodeDetail node={null} approvalPendingId={null} onResolveApproval={vi.fn()} />);

    expect(screen.getByText('노드를 선택하세요')).toBeInTheDocument();
  });

  it('renders selected node metadata safely', () => {
    render(<ExecutionNodeDetail node={toolNode} approvalPendingId={null} onResolveApproval={vi.fn()} />);

    expect(screen.getByText('Scrape Url')).toBeInTheDocument();
    expect(screen.getByText('sourcing_scrape_url')).toBeInTheDocument();
    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('오프로드 장난감 자동차')).toBeInTheDocument();
    expect(screen.getByText('imageCount')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('resolves an approval node from the right panel', () => {
    const onResolveApproval = vi.fn();
    render(
      <ExecutionNodeDetail
        node={approvalNode}
        approvalPendingId={null}
        onResolveApproval={onResolveApproval}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.click(screen.getByRole('button', { name: '거절' }));

    expect(onResolveApproval).toHaveBeenCalledWith('approval-1', 'approved');
    expect(onResolveApproval).toHaveBeenCalledWith('approval-1', 'rejected');
  });
});
