import { describe, expect, it } from 'vitest';
import { resolveOperationsRedirect } from './operations-navigation';

describe('resolveOperationsRedirect', () => {
  it.each([
    ['/inventory', {}, '/inventory-hub?tab=inventory'],
    ['/stock-ops', {}, '/inventory-hub?tab=attention&view=sellpia-zero'],
    ['/order-collection', {}, '/order-hub?tab=collection'],
    ['/orders', {}, '/order-hub?tab=processing'],
    ['/unshipped-items', {}, '/order-hub?tab=exceptions&view=unshipped'],
    ['/outbound', {}, '/order-hub?tab=shipping'],
    ['/order-status-hub', {}, '/order-hub?tab=exceptions&view=order-inventory'],
    ['/rocket-orders', {}, '/purchase-orders?tab=rocket'],
    ['/product-hub/options', {}, '/product-hub?view=options'],
  ])('maps the legacy route %s to its canonical workspace', (pathname, searchParams, expected) => {
    expect(resolveOperationsRedirect(pathname, searchParams)).toBe(expected);
  });

  it.each([
    ['sellpia-zero', '/inventory-hub?tab=attention&view=sellpia-zero'],
    ['channel-zero', '/inventory-hub?tab=attention&view=channel-zero'],
    ['bottlenecks', '/inventory-hub?tab=attention&view=bottlenecks'],
    ['mapping-attention', '/product-hub/matching?status=needs_review'],
    ['inventory-value', '/inventory-hub?tab=history&view=assets'],
    ['transfer', '/inventory-hub?tab=history&view=transfer'],
    ['return', '/inventory-hub?tab=history&view=return'],
    ['return-transfer', '/inventory-hub?tab=history&view=return'],
    ['freshness', '/inventory-hub?tab=overview'],
  ])('maps the legacy stock subtab %s', (tab, expected) => {
    expect(resolveOperationsRedirect('/stock-ops', { tab })).toBe(expected);
  });

  it.each([
    ['inventory', '/order-hub?tab=exceptions&view=order-inventory'],
    ['delivery', '/order-hub?tab=shipping&view=delivery-search'],
    ['compare', '/order-hub?tab=exceptions&view=order-compare'],
    ['sync', '/order-hub?tab=exceptions&view=sync-check'],
  ])('maps the legacy order-status subtab %s', (tab, expected) => {
    expect(resolveOperationsRedirect('/order-status-hub', { tab })).toBe(expected);
  });

  it.each([
    ['/inventory-hub', 'status', '/inventory-hub?tab=inventory'],
    ['/inventory-hub', 'po', '/purchase-orders?tab=general'],
    ['/inventory-hub', 'sellpia-sync', '/inventory-hub?tab=overview'],
    ['/inventory-hub', 'assets', '/inventory-hub?tab=history&view=assets'],
    ['/inventory-hub', 'io', '/inventory-hub?tab=history&view=transfer'],
    ['/inventory-hub', 'ledger', '/inventory-hub?tab=history&view=transfer'],
    ['/inventory-hub', 'audits', '/inventory-hub?tab=overview'],
    ['/inventory-hub', 'rocket-events', '/inventory-hub?tab=attention&view=channel-availability'],
    ['/order-hub', 'orders', '/order-hub?tab=processing'],
    ['/order-hub', 'picking', '/order-hub?tab=processing&view=picking'],
    ['/order-hub', 'outbound', '/order-hub?tab=shipping'],
    ['/order-hub', 'matching', '/product-hub/matching'],
  ])('maps the compatibility alias %s?tab=%s', (pathname, tab, expected) => {
    expect(resolveOperationsRedirect(pathname, { tab })).toBe(expected);
  });

  it('lets canonical keys override consumed legacy tab, view, and status values', () => {
    expect(resolveOperationsRedirect('/stock-ops', {
      tab: 'mapping-attention',
      view: 'legacy-view',
      status: ['legacy', 'duplicate'],
      search: '보넷',
    })).toBe('/product-hub/matching?status=needs_review&search=%EB%B3%B4%EB%84%B7');
  });

  it('preserves unrelated values once, sorts their keys, and retains repeated value order', () => {
    expect(resolveOperationsRedirect('/inventory', {
      tab: 'legacy',
      status: ['a', 'b'],
      search: '보넷 모자',
      orderId: 'po-1',
      supplierId: 'supplier-1',
      to: '2026-07-31',
      from: '2026-07-01',
      ignored: undefined,
    })).toBe(
      '/inventory-hub?tab=inventory&from=2026-07-01&orderId=po-1&search=%EB%B3%B4%EB%84%B7+%EB%AA%A8%EC%9E%90&status=a&status=b&supplierId=supplier-1&to=2026-07-31',
    );
  });

  it('preserves unrelated keys that share names with object prototype properties', () => {
    const searchParams = Object.fromEntries([
      ['constructor', 'constructor-value'],
      ['toString', 'to-string-value'],
      ['__proto__', 'proto-value'],
      ['search', 'hat'],
    ]);

    expect(resolveOperationsRedirect('/inventory', searchParams)).toBe(
      '/inventory-hub?tab=inventory&__proto__=proto-value&constructor=constructor-value&search=hat&toString=to-string-value',
    );
  });

  it('removes stale legacy view state when a compatibility alias chooses a canonical view', () => {
    expect(resolveOperationsRedirect('/inventory-hub', {
      tab: 'status',
      view: 'assets',
      search: 'hat',
    })).toBe('/inventory-hub?tab=inventory&search=hat');
  });

  it.each([
    ['/inventory-hub', {}],
    ['/inventory-hub', { tab: 'overview', search: 'hat' }],
    ['/order-hub', { tab: 'processing', orderId: 'order-1' }],
    ['/purchase-orders', { tab: 'general', supplierId: 'supplier-1' }],
    ['/product-hub', { view: 'options' }],
    ['/product-hub/matching', { status: 'needs_review' }],
  ])('returns null for canonical location %s', (pathname, searchParams) => {
    expect(resolveOperationsRedirect(pathname, searchParams)).toBeNull();
  });
});
