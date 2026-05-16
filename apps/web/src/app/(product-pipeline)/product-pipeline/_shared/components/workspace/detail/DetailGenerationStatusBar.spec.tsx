import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DetailGenerationStatusBar from './DetailGenerationStatusBar';

describe('DetailGenerationStatusBar', () => {
  it('shows failed and running generation state outside the version list', () => {
    render(
      <DetailGenerationStatusBar
        rows={[
          {
            key: 'agent:failed-1',
            kind: 'agent',
            id: 'failed-1',
            title: '실패 상세페이지',
            status: 'FAILED',
            createdAt: '2026-05-16T01:00:00.000Z',
            templateLabel: 'KidsPlayful',
            isCompletedVersion: false,
            isRegistrationDetail: false,
            errorMessage: 'agent failed',
          },
        ]}
      />,
    );

    expect(screen.getByText('상세페이지 생성 상태')).toBeInTheDocument();
    expect(screen.getByText('실패 상세페이지')).toBeInTheDocument();
    expect(screen.getByText('agent failed')).toBeInTheDocument();
  });
});
