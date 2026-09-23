import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductAvailabilityRepositoryAdapter } from '../../products/adapter/out/persistence/product-availability.repository.adapter';
import { ProductSourceReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { ProductAvailabilityUseCase } from '../../products/application/usecase/product-availability.usecase';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { SellpiaRecipeEvidenceAdapter } from '../adapter/out/inventory/sellpia-recipe-evidence.adapter';
import { ChannelRecipeSuggestionContextRepositoryAdapter } from '../adapter/out/repository/channel-recipe-suggestion-context.repository.adapter';
import { ListingRegistrationPersistenceAdapter } from '../adapter/out/persistence/listing-registration.persistence.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../adapter/out/products/product-mapping-generation.adapter';
import { ChannelRecipeSuggestionService } from '../application/service/listing/channel-recipe-suggestion.service';
import { ChannelRegistrationService } from '../application/service/registration/channel-registration.service';
import type { ChannelOptionRecipePort } from '../application/port/in/channel-option-recipe.port';
import { ChannelAdapterRegistryAdapter } from '../adapter/out/channel/channel-adapter-registry.adapter';
import { CoupangChannelAdapter } from '../adapter/out/channel/coupang/coupang-channel.adapter';
import type { ChannelRegistrationPort } from '../application/port/in/registration/channel-registration.port';
import type { RepresentativeImageRunnerPort } from '../application/port/out/automation/representative-image-runner.port';

/** 대표이미지 runner 는 개발 서버 Playwriter — 테스트에서 부르면 실패한다. */
const UNUSED_RUNNER: RepresentativeImageRunnerPort = {
  isBlocked: () => true,
  upload: () => Promise.reject(new Error('representative image runner is not part of this test')),
};

/**
 * 실제 채널 어댑터 registry(KID-321). 셀피아 사전검사는 쿠팡 등록 준비만 부른다 — 그 경로를 쓰지 않는 테스트는
 * 넘기지 않고, 부르면 실패한다.
 */
export function channelAdapters(input: {
  registration?: Pick<ChannelRegistrationPort, 'preflightExternalProductRegistration'>;
  runner?: RepresentativeImageRunnerPort;
} = {}): ChannelAdapterRegistryAdapter {
  const registration = input.registration ?? {
    preflightExternalProductRegistration: () => Promise.reject(new Error('Sellpia preflight is not part of this test')),
  };
  return new ChannelAdapterRegistryAdapter(new CoupangChannelAdapter(registration, input.runner ?? UNUSED_RUNNER));
}

/**
 * 실제 셀피아 사전검사(ChannelRegistrationService + 실제 추천 · 재고 · 몰 상품 어댑터). 쿠팡 등록 준비가 이것으로
 * 셀피아 상품을 확인하고 기존 몰 상품을 찾는다.
 */
export function realRegistrationPreflight(
  prisma: PrismaClient | PrismaService,
  recipes?: ChannelOptionRecipePort,
): Pick<ChannelRegistrationPort, 'preflightExternalProductRegistration'> {
  const db = prisma as unknown as PrismaService;
  const products = new ProductSourceReadRepositoryAdapter(db);
  const availability = new ProductAvailabilityUseCase(new ProductAvailabilityRepositoryAdapter(db));
  const suggestions = new ChannelRecipeSuggestionService(
    new ChannelRecipeSuggestionContextRepositoryAdapter(db, products),
    new SellpiaRecipeEvidenceAdapter(products, availability),
  );
  return new ChannelRegistrationService(
    new ListingRegistrationPersistenceAdapter(
      db,
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
      recipes,
    ),
    suggestions,
  );
}
