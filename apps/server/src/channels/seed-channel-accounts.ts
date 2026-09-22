/** Command-line composition for the organization-scoped account seed. */
import type { PrismaService } from '../prisma/prisma.service';
import { ChannelAccountService } from './application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from './adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from './adapter/out/credentials/channel-credentials.adapter';
import { ChannelsProductMappingGenerationAdapter } from './adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { createOrderCollectionMallSeedPrisma, loadOrderCollectionMallSeedEnv, resolveOrderCollectionMallSeedConfig, seedOrderCollectionMallAccounts } from './adapter/in/cli/mall-account-seed';

export async function runOrderCollectionMallSeed() {
  loadOrderCollectionMallSeedEnv();
  const config = resolveOrderCollectionMallSeedConfig();
  const prisma = createOrderCollectionMallSeedPrisma();
  try {
    // 이 시드는 list/update/getPassword만 쓰지만(claimProviderIdentity·upsertCoupangSettings는
    // 쓰지 않음), 어댑터는 매핑 세대 소유자를 필수로 받는다 — 빠진 배선이 부트에서 드러나야 한다.
    const accounts = new ChannelAccountService(
      new ChannelAccountPersistenceAdapter(
        prisma as unknown as PrismaService,
        new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
      ),
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
