import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { ChannelCatalogIdentityPort } from '../../port/in/collection/catalog-identity.port';
import type { ChannelCatalogIdentityPersistencePort } from '../../port/out/persistence/catalog-identity.persistence.port';
import { ListingException } from '../../exception/listing.exception';
export class CatalogIdentityService implements ChannelCatalogIdentityPort {
  constructor(private readonly persistence: ChannelCatalogIdentityPersistencePort) {}
  publishObservedIdentities(transaction: OwnerTransaction, input: Parameters<ChannelCatalogIdentityPort['publishObservedIdentities']>[1]) {
    const productIds = new Set<string>();
    for (const product of input.products) {
      if (!product.externalProductId || productIds.has(product.externalProductId)) throw new ListingException('invalid', '수집 상품 식별자가 비어 있거나 중복되었습니다.');
      productIds.add(product.externalProductId);
      const options = new Set<string>();
      for (const option of product.options) {
        if (!option.externalOptionId || options.has(option.externalOptionId)) throw new ListingException('invalid', '수집 옵션 식별자가 비어 있거나 중복되었습니다.');
        options.add(option.externalOptionId);
      }
    }
    return this.persistence.publishObservedIdentities(transaction, input);
  }
}
