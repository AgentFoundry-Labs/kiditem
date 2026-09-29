import { describe, expect, it } from 'vitest';
import { clearSupplierCookies } from './cookies';

describe('쿠팡 공급사 쿠키 정리(쿠키 과다 400 복구)', () => {
  it('supplier.coupang.com에 걸리는 쿠키를 이름·경로로만 지우고 값은 쓰지 않는다', async () => {
    const removed: unknown[] = [];
    const cookie = (name: string, path: string) => ({
      name,
      path,
      storeId: '0',
      get value(): string {
        throw new Error('쿠키 값을 읽으면 안 된다');
      },
    });
    const result = await clearSupplierCookies({
      getAll: async (details) => {
        expect(details).toEqual({ url: 'https://supplier.coupang.com/' });
        return [cookie('a', '/'), cookie('b', '/ibs'), cookie('c', '')];
      },
      remove: async (details) => {
        removed.push(details);
        if (details.name === 'b') throw new Error('실패');
        return null;
      },
    });
    expect(removed).toEqual([
      { url: 'https://supplier.coupang.com/', name: 'a', storeId: '0' },
      { url: 'https://supplier.coupang.com/ibs', name: 'b', storeId: '0' },
      { url: 'https://supplier.coupang.com/', name: 'c', storeId: '0' },
    ]);
    expect(result).toEqual({ cleared: 2, total: 3 });
  });
});
