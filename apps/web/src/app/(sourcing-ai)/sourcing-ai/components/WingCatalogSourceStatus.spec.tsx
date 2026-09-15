import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WingCatalogSource } from '../hooks/use-wing-catalog-source';
import { WingCatalogSourceStatus } from './WingCatalogSourceStatus';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

function sourceEnding(errorCode: string, errorMessage: string): WingCatalogSource {
  const attempt = {
    attemptId: ATTEMPT_ID,
    state: 'FAILED' as const,
    plan: { keywords: ['연필'], maxPages: 1, purpose: 'catalog_search' },
    errorCode,
    errorMessage,
  };
  // The status reads only the attempt; start and stop belong to the screen's shared control.
  return { attempt } as unknown as WingCatalogSource;
}

describe('WingCatalogSourceStatus', () => {
  it('shows a collection a stop cancelled as stopped, not failed', () => {
    render(
      <WingCatalogSourceStatus
        source={sourceEnding('COLLECTION_CANCELLED', 'Wing catalog collection was cancelled by the user.')}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Wing 카탈로그 수집 중단됨');
    expect(screen.getByRole('status')).toHaveTextContent('수집을 중단했습니다. 저장된 완료본은 유지됩니다.');
    expect(
      screen.queryByText('Wing catalog collection was cancelled by the user.'),
    ).not.toBeInTheDocument();
  });

  it('shows a failed collection with its reason', () => {
    render(<WingCatalogSourceStatus source={sourceEnding('WING_PROVIDER_WALL', 'Wing 로그인이 필요합니다.')} />);

    expect(screen.getByRole('status')).toHaveTextContent('Wing 카탈로그 수집 실패');
    expect(screen.getByText('Wing 로그인이 필요합니다.')).toBeInTheDocument();
  });
});
