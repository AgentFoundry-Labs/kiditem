import { describe, expect, it, vi } from 'vitest';
import { lockProductMapping } from '../transaction/product-mapping-lock';

/**
 * 매핑 잠금은 Products 소유다(KID-111) — 다른 owner 는 이 함수로 자기 트랜잭션 안에서 잠그고,
 * 세대 전진은 Products 포트로만 한다. 잠금 키는 조직마다 하나다.
 */
describe('lockProductMapping', () => {
  it('takes one transaction-scoped advisory lock keyed by the organization', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ lock: '' }]);

    await lockProductMapping({ $queryRaw: queryRaw } as never, 'org-1');

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = queryRaw.mock.calls[0]![0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain('pg_advisory_xact_lock');
    expect(sql.values).toEqual(['kiditem.product-mapping:org-1']);
  });
});
