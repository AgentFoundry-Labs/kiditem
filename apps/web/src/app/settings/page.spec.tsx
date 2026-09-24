import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getParsed: vi.fn().mockResolvedValue({
      configured: false,
      vendorId: null,
      status: 'inactive',
      updatedAt: null,
    }),
    patchParsed: vi.fn(),
  },
}));

vi.mock('./components/CoupangTab', () => ({ default: () => <div>coupang</div> }));
vi.mock('./components/AdsCsvUpload', () => ({ default: () => <div>ads</div> }));
vi.mock('./components/ReportDownload', () => ({ default: () => <div>reports</div> }));
vi.mock('./components/PrinterSettings', () => ({ default: () => <div>printer</div> }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe('SettingsPage', () => {
  it('does not render the retired deletion-password settings surface', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: '설정' })).toBeInTheDocument();
    expect(screen.getByText('쿠팡 Wing 계정 식별자, 브라우저 수집, 보고서를 관리합니다.'))
      .toBeInTheDocument();
    expect(screen.queryByText('삭제 비밀번호')).not.toBeInTheDocument();
    expect(screen.queryByText('삭제 보안')).not.toBeInTheDocument();
    expect(screen.queryByText(/등록하기 전까지 삭제 기능을 쓸 수 없습니다/)).not.toBeInTheDocument();
  });

  it('has no traffic CSV upload — Wing traffic comes only from the dashboard collection (KID-110)', () => {
    renderPage();

    expect(screen.queryByText('트래픽 데이터 업로드')).not.toBeInTheDocument();
    expect(screen.queryByText(/트래픽 엑셀 업로드/)).not.toBeInTheDocument();
  });
});
