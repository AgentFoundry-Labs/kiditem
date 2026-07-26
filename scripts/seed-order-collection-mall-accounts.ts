/**
 * Organization-scoped order-collection mall credential seed wrapper.
 *
 * Usage:
 *   ORDER_COLLECTION_MALL_SEED_CONFIRM=APPLY_ORDER_COLLECTION_MALL_ACCOUNTS \
 *     npm run seed:order-collection-malls
 */
import { runOrderCollectionMallSeed } from "../apps/server/src/orders/seed-order-collection-mall-accounts";

runOrderCollectionMallSeed().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
