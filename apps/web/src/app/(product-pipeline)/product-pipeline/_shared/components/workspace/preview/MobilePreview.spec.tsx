import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MobilePreview from './MobilePreview';

const previewProps = {
  name: '테스트 자석 다트',
  mainImage: 'https://cdn.example.com/product.jpg',
  salePrice: 17000,
  originalPrice: 20000,
  discountRate: 15,
  rating: 4.7,
  reviewCount: 123,
};

describe('MobilePreview', () => {
  it('keeps the existing Coupang preview modes', () => {
    render(<MobilePreview {...previewProps} />);

    expect(screen.getByRole('button', { name: /상세/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /검색/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /목록/ })).toBeInTheDocument();
    expect(screen.getByText('테스트 자석 다트')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /검색/ }));
    expect(screen.getByText('약 1,234개 상품')).toBeInTheDocument();
  });

  it('can render selected detail html inside the mobile PDP context', () => {
    render(
      <MobilePreview
        {...previewProps}
        detailHtml="<html><body><section>상세페이지 버전 본문</section></body></html>"
      />,
    );

    expect(screen.getByTitle('mobile-registration-detail-preview')).toBeInTheDocument();
    expect(screen.getByTitle('mobile-registration-detail-preview')).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('상세페이지 버전 본문'),
    );
  });

  it('keeps selected detail html in the phone scroll flow instead of clipping it', () => {
    render(
      <MobilePreview
        {...previewProps}
        detailHtml="<html><body><section>스크롤 상세페이지 본문</section></body></html>"
      />,
    );

    expect(screen.getByTestId('mobile-preview-phone-scroll')).toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('mobile-preview-detail-scroll-region')).toBeInTheDocument();
    expect(screen.getByTitle('mobile-registration-detail-preview')).toHaveClass(
      'pointer-events-none',
    );
    expect(screen.getByTitle('mobile-registration-detail-preview')).toHaveAttribute(
      'sandbox',
      'allow-scripts',
    );
    expect(screen.getByTitle('mobile-registration-detail-preview')).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('kiditem:detail-preview-metrics'),
    );
  });
});
