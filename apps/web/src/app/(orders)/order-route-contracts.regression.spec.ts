import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ordersRoot = path.resolve(import.meta.dirname);
const retiredOrderRoutes = [
  'order-hub',
  'cs-management',
  'order-status-hub',
  'returns',
  'return-scan',
] as const;

describe('order route contracts', () => {
  it.each([
    ['order-collection/page.tsx', "from './components/OrderCollectionWorkspace'", 'OrderCollectionWorkspace'],
    ['orders/page.tsx', "from './components/OrderProcessingWorkspace'", 'OrderProcessingWorkspace'],
  ])('%s owns its live workspace', (relativePath, importSource, workspace) => {
    const source = readFileSync(path.join(ordersRoot, relativePath), 'utf8');
    expect(source).toContain(importSource);
    expect(source).toContain(`<${workspace} />`);
    expect(source).not.toContain('headingLevel');
    expect(source).not.toContain('order-hub');
    expect(source).not.toContain('redirect(');
  });

  it.each([
    [
      'order-collection/components/OrderCollectionWorkspace.tsx',
      ['headingLevel'],
      '<h1 className="text-2xl font-bold tracking-tight text-slate-900">주문 수집</h1>',
    ],
    [
      'orders/components/OrderProcessingWorkspace.tsx',
      ['headingLevel'],
      '<OrderHeader',
    ],
    [
      'orders/components/OrderHeader.tsx',
      ['headingLevel', 'showHeading'],
      '<h1 className="page-title">주문 처리</h1>',
    ],
  ])('%s has a fixed page heading without hub-only props', (
    relativePath,
    retiredProps,
    fixedHeading,
  ) => {
    const source = readFileSync(path.join(ordersRoot, relativePath), 'utf8');

    expect(source).toContain(fixedHeading);
    for (const retiredProp of retiredProps) {
      expect(source).not.toContain(retiredProp);
    }
  });

  it.each([
    'order-hub/components/OrderCollectionWorkspace.tsx',
    'order-hub/components/OrderCollectionWorkspace.spec.tsx',
    'order-hub/components/OrderProcessingWorkspace.tsx',
    'order-hub/components/OrderProcessingWorkspace.spec.tsx',
    'order-hub/components/OrderHubWorkspace.tsx',
    'order-hub/components/OrderHubWorkspace.spec.tsx',
    'order-hub/components/OrderShippingWorkspace.tsx',
    'order-hub/components/OrderExceptionsWorkspace.tsx',
    'order-hub/components/OrderExceptionsWorkspace.regression-1.test.tsx',
  ])('%s does not survive as an alternative shell', (relativePath) => {
    expect(existsSync(path.join(ordersRoot, relativePath))).toBe(false);
  });

  it.each(retiredOrderRoutes)(
    '/%s and its route-only code are fully retired',
    (route) => {
      expect(existsSync(path.join(ordersRoot, route))).toBe(false);
    },
  );
});
