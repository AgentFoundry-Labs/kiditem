import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { RegistrationContentWorkspaceService } from '../content/application/service/registration-content-workspace.service';
import { RegistrationContentWorkspaceRepositoryAdapter } from '../content/adapter/out/repository/registration-content-workspace.repository.adapter';
import { ChannelListingQueryService } from '../channels/application/service/listing/channel-listing-query.service';
import { ChannelListingQueryPersistenceAdapter } from '../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { RegistrableDetailPageAdapter } from '../channels/adapter/out/content/registrable-detail-page.adapter';
import type { RegistrationContentWorkspacePort } from '../content/application/port/in/workspace/registration-content-workspace.port';
import type { ChannelRegistrableDetailPagePort } from '../channels/application/port/out/content/registrable-detail-page.port';

/**
 * 판매 상품의 콘텐츠 작업공간과 상세 revision 을 실제 Content 어댑터로 엮는다(KID-313 W2). 상품을 만드는
 * 길과 상세를 읽는 길이 Content 계약을 부르므로, PG spec 은 가짜 대신 이것을 쓴다.
 */
export function realRegistrationContentWorkspace(prisma: PrismaClient | PrismaService): RegistrationContentWorkspacePort {
  return new RegistrationContentWorkspaceService(new RegistrationContentWorkspaceRepositoryAdapter(
    prisma as unknown as PrismaService,
    new ChannelListingQueryService(
      new ChannelListingQueryPersistenceAdapter(prisma as never),
      { findForListings: async () => [] },
    ),
  ));
}

export function realRegistrableDetailPages(prisma: PrismaClient | PrismaService): ChannelRegistrableDetailPagePort {
  return new RegistrableDetailPageAdapter(realRegistrationContentWorkspace(prisma));
}
