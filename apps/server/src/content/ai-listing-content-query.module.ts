import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AI_LISTING_CONTENT_QUERY_PORT } from './application/port/in/workspace/listing-content-query.port';
import { ListingContentQueryRepositoryAdapter } from './adapter/out/repository/listing-content-query.repository.adapter';
/** Content facts by scalar listing IDs; independent of provider and generation runtimes. */
@Module({
  imports: [PrismaModule],
  providers: [ListingContentQueryRepositoryAdapter, { provide: AI_LISTING_CONTENT_QUERY_PORT, useExisting: ListingContentQueryRepositoryAdapter }],
  exports: [AI_LISTING_CONTENT_QUERY_PORT],
})
export class AiListingContentQueryModule {}
