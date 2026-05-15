import { Pagination } from '@/components/ui/Pagination';
import { formatDate, formatKRW, formatPercent } from '@/lib/utils';
import { PAGE_SIZE } from '../../lib/statistics-data';
import { StatBox } from './StatBox';
import type { StatisticsRepurchaseResponse } from '@kiditem/shared/statistics';

type RepurchasePanelProps = {
  repurchase: StatisticsRepurchaseResponse;
  productPage: number;
  customerPage: number;
  onProductPageChange: (page: number) => void;
  onCustomerPageChange: (page: number) => void;
};

export function RepurchasePanel({
  repurchase,
  productPage,
  customerPage,
  onProductPageChange,
  onCustomerPageChange,
}: RepurchasePanelProps) {
  const repeatProducts = repurchase.repeatProducts;
  const repeatCustomers = repurchase.repeatCustomers;
  const pagedProducts = repeatProducts.slice(
    (productPage - 1) * PAGE_SIZE,
    productPage * PAGE_SIZE,
  );
  const pagedCustomers = repeatCustomers.slice(
    (customerPage - 1) * PAGE_SIZE,
    customerPage * PAGE_SIZE,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="전체 고객수" value={repurchase.totalCustomers} unit="명" />
        <StatBox label="재구매 고객" value={repurchase.repeatCount} unit="명" />
        <StatBox
          label="재구매율"
          value={formatPercent(repurchase.repurchaseRate * 100)}
          unit=""
        />
      </div>

      {repeatProducts.length > 0 && (
        <div className="table-card">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="section-title">재구매 상품</h3>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>상품명</th>
                  <th>카테고리</th>
                  <th className="text-right">주문횟수</th>
                </tr>
              </thead>
              <tbody>
                {pagedProducts.map((product, index) => (
                  <tr key={product.masterId}>
                    <td className="tabular-nums text-[var(--text-muted)]">
                      {(productPage - 1) * PAGE_SIZE + index + 1}
                    </td>
                    <td className="max-w-[200px] truncate font-medium text-[var(--text-primary)]">
                      {product.productName}
                    </td>
                    <td className="text-xs text-[var(--text-secondary)]">
                      {product.category ?? '-'}
                    </td>
                    <td className="text-right tabular-nums font-semibold text-[var(--primary)]">
                      {product.orderCount}회
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={productPage}
            limit={PAGE_SIZE}
            total={repeatProducts.length}
            onPageChange={onProductPageChange}
          />
        </div>
      )}

      {repeatCustomers.length > 0 && (
        <div className="table-card">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="section-title">재구매 고객</h3>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>고객명</th>
                  <th className="text-right">주문횟수</th>
                  <th className="text-right">총 주문금액</th>
                  <th>마지막 주문</th>
                </tr>
              </thead>
              <tbody>
                {pagedCustomers.map((customer) => (
                  <tr key={`${customer.name}-${customer.lastOrder ?? 'none'}`}>
                    <td className="font-medium text-[var(--text-primary)]">
                      {customer.name}
                    </td>
                    <td className="text-right tabular-nums font-semibold text-[var(--primary)]">
                      {customer.count}회
                    </td>
                    <td className="text-right tabular-nums">
                      {formatKRW(customer.totalAmount)}원
                    </td>
                    <td className="text-xs font-mono text-[var(--text-secondary)]">
                      {customer.lastOrder ? formatDate(customer.lastOrder) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={customerPage}
            limit={PAGE_SIZE}
            total={repeatCustomers.length}
            onPageChange={onCustomerPageChange}
          />
        </div>
      )}
    </div>
  );
}
