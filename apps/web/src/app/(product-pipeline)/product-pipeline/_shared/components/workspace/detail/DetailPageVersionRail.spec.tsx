import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DetailPageVersionRail from './DetailPageVersionRail';

describe('DetailPageVersionRail', () => {
  it('renders completed versions and marks the registration detail page', () => {
    const onSelect = vi.fn();
    render(
      <DetailPageVersionRail
        rows={[
          {
            key: 'agent:version-1',
            kind: 'agent',
            id: 'version-1',
            title: '완성 상세페이지',
            status: 'COMPLETED',
            createdAt: '2026-05-16T01:00:00.000Z',
            templateLabel: 'KidsPlayful',
            isCompletedVersion: true,
            isRegistrationDetail: true,
            errorMessage: null,
          },
        ]}
        selectedKey={null}
        applyingKey={null}
        onSelect={onSelect}
        onApply={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('상세페이지 버전')).toBeInTheDocument();
    expect(screen.getByText('등록 상세')).toBeInTheDocument();
    fireEvent.click(screen.getByText('완성 상세페이지'));
    expect(onSelect).toHaveBeenCalledWith('agent:version-1');
  });
});
