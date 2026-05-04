import { Injectable } from '@nestjs/common';
import { MastersService } from '../../../../products/application/service/masters.service';
import type {
  SourcingCreateMasterInput,
  SourcingMasterHandle,
  SourcingProductsCatalogPort,
} from '../../../application/port/out/products-catalog.port';

/**
 * `SOURCING_PRODUCTS_CATALOG_PORT` 의 concrete adapter.
 *
 * 이 adapter 만 products domain 의 `MastersService` 를 import 한다. sourcing
 * application service 는 port 만 의존하므로 cross-domain 침범이 격리된다.
 *
 * `MastersService.create` 는 `MasterCodeService` 를 트랜잭션 내부에서
 * 호출하여 `MasterCodeCounter` 를 increment + `M-00000001` 형식의 code 를
 * 발급한다. 따라서 sourcing/AGENTS.md 가 요구하는 "Plan B3 (MasterCodeService
 * integration)" 전제는 이 어댑터를 통해 자연 충족된다.
 */
@Injectable()
export class SourcingProductsCatalogAdapter implements SourcingProductsCatalogPort {
  constructor(private readonly masters: MastersService) {}

  async createMaster(
    organizationId: string,
    input: SourcingCreateMasterInput,
  ): Promise<SourcingMasterHandle> {
    const created = await this.masters.create(organizationId, {
      name: input.name,
      description: input.description,
      thumbnailUrl: input.thumbnailUrl,
      imageUrl: input.imageUrl,
      images: input.images?.map((img) => ({
        url: img.url,
        role: img.role,
        label: img.label ?? null,
        sortOrder: img.sortOrder,
        source: img.source,
        isPrimary: img.isPrimary,
      })),
      costCny: input.costCny,
      category: input.category,
      tags: input.tags,
      sourceUrl: input.sourceUrl,
      sourcePlatform: input.sourcePlatform,
      pipelineStep: input.pipelineStep,
    });
    return { id: created.id };
  }
}
