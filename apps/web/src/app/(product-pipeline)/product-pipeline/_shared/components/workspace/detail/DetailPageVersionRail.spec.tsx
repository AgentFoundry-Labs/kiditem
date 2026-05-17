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
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('최근 1 개')).toBeInTheDocument();
    expect(screen.getByText('등록 상세')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상세페이지 버전 작업' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('완성 상세페이지'));
    expect(onSelect).toHaveBeenCalledWith('agent:version-1');
  });

  it('labels every completed version apply action as registration detail selection', () => {
    render(
      <DetailPageVersionRail
        rows={[
          {
            key: 'bold:version-1',
            kind: 'bold-vertical',
            id: 'version-1',
            title: 'KIDITEM 상세페이지',
            status: 'completed',
            createdAt: '2026-05-16T01:00:00.000Z',
            templateLabel: 'KIDITEM DESIGN',
            isCompletedVersion: true,
            isRegistrationDetail: false,
            errorMessage: null,
          },
        ]}
        selectedKey="bold:version-1"
        applyingKey={null}
        onSelect={vi.fn()}
        onApply={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /등록 상세로 적용/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /미리보기에 적용/ })).not.toBeInTheDocument();
  });

  it('shows version management actions in the selected row overflow menu and keeps the footer focused on apply', () => {
    const row = {
      key: 'bold:version-1',
      kind: 'bold-vertical' as const,
      id: 'version-1',
      title: 'KIDITEM 상세페이지',
      status: 'completed',
      createdAt: '2026-05-16T01:00:00.000Z',
      templateLabel: 'KIDITEM DESIGN',
      isCompletedVersion: true,
      isRegistrationDetail: false,
      errorMessage: null,
    };
    const onRename = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();

    render(
      <DetailPageVersionRail
        rows={[row]}
        selectedKey="bold:version-1"
        applyingKey={null}
        onSelect={vi.fn()}
        onApply={vi.fn()}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '상세페이지 버전 작업' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '이름 변경' }));
    fireEvent.click(screen.getByRole('button', { name: '상세페이지 버전 작업' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '복제' }));
    fireEvent.click(screen.getByRole('button', { name: '상세페이지 버전 작업' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '삭제' }));

    expect(onRename).toHaveBeenCalledWith(row);
    expect(onDuplicate).toHaveBeenCalledWith(row);
    expect(onDelete).toHaveBeenCalledWith(row);
    expect(screen.queryByRole('button', { name: '선택한 항목 삭제' })).not.toBeInTheDocument();
  });
});
