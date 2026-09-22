import type { ProductTransactionalReadPort } from '../../products/application/port/in/product-transactional-read.port';

/**
 * KID 발급이 셀피아 단품 하나짜리 구성의 원천 코드를 다시 쓸 때만 Products 를 읽는다.
 * 그 경로를 타지 않는 테스트는 빈 응답이면 충분하다.
 */
export function productTransactionalRead(
  identities: readonly { masterProductId: string; code: string }[] = [],
): ProductTransactionalReadPort {
  return {
    lock: async () => ({ mappingGeneration: 1n }),
    readSourceIdentities: async () => identities.map((identity) => ({
      ...identity,
      name: identity.code,
      optionName: null,
    })),
    readAvailability: async () => ({ items: [] }),
  } as unknown as ProductTransactionalReadPort;
}
