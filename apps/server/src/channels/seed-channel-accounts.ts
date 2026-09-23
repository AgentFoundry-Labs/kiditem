/** Command-line composition for the organization-scoped account seed. */
import type { PrismaService } from '../prisma/prisma.service';
import { ChannelAccountService } from './application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from './adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from './adapter/out/credentials/channel-credentials.adapter';
import type { ChannelsProductMappingGenerationPort } from './application/port/out/cross-domain/product-mapping-generation.port';
import { createOrderCollectionMallSeedPrisma, loadOrderCollectionMallSeedEnv, resolveOrderCollectionMallSeedConfig, seedOrderCollectionMallAccounts } from './adapter/in/cli/mall-account-seed';

/**
 * 이 시드는 list/update/getPassword 만 쓴다 — 매핑 세대를 갱신하는
 * `claimProviderIdentity` · `upsertCoupangSettings` 를 부르지 않는다. 어댑터는 그 소유자를
 * 필수로 받으므로(빠진 배선이 부트에서 드러나야 한다) 여기서는 "쓰지 않는다"를 그대로 적어 둔다:
 * 누군가 그 경로를 이 시드에 더하면 조용히 넘어가지 않고 여기서 멈춘다.
 */
const UNUSED_MAPPING_GENERATION: ChannelsProductMappingGenerationPort = {
  advance() {
    return Promise.reject(new Error('The mall account seed does not advance product mapping generations.'));
  },
};

export async function runOrderCollectionMallSeed() {
  loadOrderCollectionMallSeedEnv();
  const config = resolveOrderCollectionMallSeedConfig();
  const prisma = createOrderCollectionMallSeedPrisma();
  try {
    const accounts = new ChannelAccountService(
      new ChannelAccountPersistenceAdapter(prisma as unknown as PrismaService, UNUSED_MAPPING_GENERATION),
      new ChannelCredentialsAdapter(),
    );
    const result = await seedOrderCollectionMallAccounts(prisma, config, accounts);
    console.log(`Channel account seed completed: ${result.updatedCount} updated, ${result.unchangedCount} unchanged.`);
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runOrderCollectionMallSeed().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
