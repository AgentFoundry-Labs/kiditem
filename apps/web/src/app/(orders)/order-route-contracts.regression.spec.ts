import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ordersRoot = path.resolve(import.meta.dirname);

describe('order route contracts', () => {
  it.each([
    ['order-collection/page.tsx', "from './components/OrderCollectionWorkspace'", 'OrderCollectionWorkspace'],
    ['orders/page.tsx', "from './components/OrderProcessingWorkspace'", 'OrderProcessingWorkspace'],
  ])('%s owns its live workspace', (relativePath, importSource, workspace) => {
    const source = readFileSync(path.join(ordersRoot, relativePath), 'utf8');
    expect(source).toContain(importSource);
    expect(source).toContain(workspace);
    expect(source).not.toContain('order-hub');
    expect(source).not.toContain('redirect(');
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

  it('keeps the former order-status tab screen instead of the order operations shell', () => {
    const source = readFileSync(path.join(ordersRoot, 'order-status-hub/page.tsx'), 'utf8');

    expect(source).toContain('title="주문 현황"');
    expect(source).toContain("label: '주문-재고'");
    expect(source).toContain("label: '배송 검색'");
    expect(source).toContain("label: '주문 비교'");
    expect(source).toContain("label: '동기화 체크'");
    expect(source).not.toContain('resolveOperationsRedirect');
    expect(source).not.toContain('주문 운영');
  });

  it('keeps the former order-processing hub labels without the replacement shell', () => {
    const source = readFileSync(path.join(ordersRoot, 'order-hub/page.tsx'), 'utf8');

    expect(source).toContain('title="주문 처리"');
    expect(source).not.toContain('includePicking');
    for (const label of ['주문 관리', '주문수집', '스마트 피킹', '출고 관리', '미매칭 주문']) {
      expect(source).toContain(`label: '${label}'`);
    }
    expect(source).not.toContain('OrderHubWorkspace');
    expect(source).not.toContain('주문 운영');
  });
});
