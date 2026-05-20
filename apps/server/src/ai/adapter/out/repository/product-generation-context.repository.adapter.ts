import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProductGenerationCandidateContext,
  ProductGenerationContextRepositoryPort,
} from '../../../application/port/out/repository/product-generation-context.repository.port';

@Injectable()
export class ProductGenerationContextRepositoryAdapter
implements ProductGenerationContextRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findCandidate(input: {
    organizationId: string;
    candidateId: string;
  }): Promise<ProductGenerationCandidateContext | null> {
    return this.prisma.sourcingCandidate.findFirst({
      where: {
        id: input.candidateId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        thumbnailUrl: true,
        images: {
          where: { isDeleted: false },
          orderBy: { sortOrder: 'asc' },
          select: { url: true, sortOrder: true },
        },
      },
    });
  }
}
