import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourcingReadState } from './SourcingReadState';

const metadata = {
  generatedAt: '2026-09-13T00:00:00.000Z',
  lastSuccessfulAt: null,
  freshUntil: null,
  operationId: null,
  warnings: [],
};

describe('SourcingReadState', () => {
  it('shows the server error code state without rendering withheld facts', () => {
    render(
      <SourcingReadState
        envelope={{
          ...metadata,
          ready: false,
          data: null,
          error: {
            code: 'SOURCE_TYPED_FACT_UNAVAILABLE',
            retryable: true,
            message: 'typed publication missing',
          },
        }}
        isLoading={false}
        error={null}
        emptyLabel="수집 결과 없음"
      >
        <div>withheld facts</div>
      </SourcingReadState>,
    );

    expect(screen.getByText(/typed publication missing/)).toBeVisible();
    expect(screen.queryByText('withheld facts')).not.toBeInTheDocument();
  });

  it('renders a confirmed ready result without a collecting or stale banner', () => {
    render(
      <SourcingReadState
        envelope={{ ...metadata, ready: true, data: {}, error: null }}
        isLoading={false}
        error={null}
        emptyLabel="수집 결과 없음"
      >
        <div>confirmed facts</div>
      </SourcingReadState>,
    );

    expect(screen.getByText('confirmed facts')).toBeVisible();
    expect(screen.queryByText(/수집하고 있습니다|최근 수집 결과/)).not.toBeInTheDocument();
  });
});
