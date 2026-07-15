export type OperationsSearchParams = Record<string, string | string[] | undefined>;

interface OperationsDestination {
  pathname: string;
  canonical: Record<string, string>;
  consumed: ReadonlySet<string>;
}

const LEGACY_ROUTE_KEYS = new Set(['tab', 'view']);

function destination(
  pathname: string,
  canonical: Record<string, string> = {},
): OperationsDestination {
  return { pathname, canonical, consumed: LEGACY_ROUTE_KEYS };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function stockOpsDestination(tab: string | undefined): OperationsDestination {
  if (tab === 'channel-zero') return destination('/inventory-hub', { tab: 'attention', view: 'channel-zero' });
  if (tab === 'bottlenecks') return destination('/inventory-hub', { tab: 'attention', view: 'bottlenecks' });
  if (tab === 'mapping-attention') return destination('/product-hub/matching', { status: 'needs_review' });
  if (tab === 'inventory-value') return destination('/inventory-hub', { tab: 'history', view: 'assets' });
  if (tab === 'transfer') return destination('/inventory-hub', { tab: 'history', view: 'transfer' });
  if (tab === 'return' || tab === 'return-transfer') return destination('/inventory-hub', { tab: 'history', view: 'return' });
  if (tab === 'freshness') return destination('/inventory-hub', { tab: 'overview' });
  return destination('/inventory-hub', { tab: 'attention', view: 'sellpia-zero' });
}

function orderStatusDestination(tab: string | undefined): OperationsDestination {
  if (tab === 'delivery') return destination('/order-hub', { tab: 'shipping', view: 'delivery-search' });
  if (tab === 'compare') return destination('/order-hub', { tab: 'exceptions', view: 'order-compare' });
  if (tab === 'sync') return destination('/order-hub', { tab: 'exceptions', view: 'sync-check' });
  return destination('/order-hub', { tab: 'exceptions', view: 'order-inventory' });
}

function inventoryHubAlias(tab: string | undefined): OperationsDestination | null {
  if (tab === 'status') return destination('/inventory-hub', { tab: 'inventory' });
  if (tab === 'po') return destination('/purchase-orders', { tab: 'general' });
  if (tab === 'sellpia-sync') return destination('/inventory-hub', { tab: 'overview' });
  if (tab === 'assets') return destination('/inventory-hub', { tab: 'history', view: 'assets' });
  if (tab === 'io' || tab === 'ledger') return destination('/inventory-hub', { tab: 'history', view: 'transfer' });
  if (tab === 'audits') return destination('/inventory-hub', { tab: 'overview' });
  if (tab === 'rocket-events') return destination('/inventory-hub', { tab: 'attention', view: 'channel-availability' });
  return null;
}

function orderHubAlias(tab: string | undefined): OperationsDestination | null {
  if (tab === 'orders') return destination('/order-hub', { tab: 'processing' });
  if (tab === 'picking') return destination('/order-hub', { tab: 'processing', view: 'picking' });
  if (tab === 'outbound') return destination('/order-hub', { tab: 'shipping' });
  if (tab === 'matching') return destination('/product-hub/matching');
  return null;
}

function resolveDestination(
  pathname: string,
  searchParams: OperationsSearchParams,
): OperationsDestination | null {
  const tab = firstValue(searchParams.tab);

  if (pathname === '/inventory') return destination('/inventory-hub', { tab: 'inventory' });
  if (pathname === '/stock-ops') return stockOpsDestination(tab);
  if (pathname === '/order-collection') return destination('/order-hub', { tab: 'collection' });
  if (pathname === '/orders') return destination('/order-hub', { tab: 'processing' });
  if (pathname === '/unshipped-items') return destination('/order-hub', { tab: 'exceptions', view: 'unshipped' });
  if (pathname === '/outbound') return destination('/order-hub', { tab: 'shipping' });
  if (pathname === '/order-status-hub') return orderStatusDestination(tab);
  if (pathname === '/rocket-orders') return destination('/purchase-orders', { tab: 'rocket' });
  if (pathname === '/product-hub/options') return destination('/product-hub', { view: 'options' });
  if (pathname === '/inventory-hub') return inventoryHubAlias(tab);
  if (pathname === '/order-hub') return orderHubAlias(tab);
  return null;
}

export function resolveOperationsRedirect(
  pathname: string,
  searchParams: OperationsSearchParams,
): string | null {
  const resolved = resolveDestination(pathname, searchParams);
  if (!resolved) return null;

  const query = new URLSearchParams();
  for (const key of Object.keys(resolved.canonical).sort()) {
    query.append(key, resolved.canonical[key]);
  }

  const unrelatedKeys = Object.keys(searchParams)
    .filter((key) => !resolved.consumed.has(key) && !(key in resolved.canonical) && searchParams[key] !== undefined)
    .sort();
  for (const key of unrelatedKeys) {
    const value = searchParams[key];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, item);
    }
  }

  const serialized = query.toString();
  return serialized ? `${resolved.pathname}?${serialized}` : resolved.pathname;
}
