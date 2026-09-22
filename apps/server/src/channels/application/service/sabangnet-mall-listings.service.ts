import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  SabangnetMallListingsBeginSchema,
  SabangnetMallListingsSubmissionSchema,
} from '@kiditem/shared/sabangnet-mall-listings';
import type { SabangnetMallListingsPort } from '../port/in/sabangnet-mall-listings.port';
import {
  SABANGNET_MALL_LISTINGS_REPOSITORY_PORT,
  type SabangnetMallListingsRepositoryPort,
} from '../port/out/repository/sabangnet-mall-listings.repository.port';

@Injectable()
export class SabangnetMallListingsService implements SabangnetMallListingsPort {
  constructor(
    @Inject(SABANGNET_MALL_LISTINGS_REPOSITORY_PORT)
    private readonly repository: SabangnetMallListingsRepositoryPort,
  ) {}

  begin(input: Parameters<SabangnetMallListingsPort['begin']>[0]) {
    const parsed = SabangnetMallListingsBeginSchema.safeParse(input.request);
    if (!parsed.success) throw new BadRequestException('SABANGNET_PLAN_INVALID');
    return this.repository.begin({ ...input, request: parsed.data });
  }

  readAttempt(input: Parameters<SabangnetMallListingsPort['readAttempt']>[0]) {
    return this.repository.readAttempt(input);
  }

  readSource(input: Parameters<SabangnetMallListingsPort['readSource']>[0]) {
    return this.repository.readSource(input);
  }

  complete(input: Parameters<SabangnetMallListingsPort['complete']>[0]) {
    const parsed = SabangnetMallListingsSubmissionSchema.safeParse(input.submission);
    if (!parsed.success) throw new BadRequestException('SABANGNET_EVIDENCE_INVALID');
    return this.repository.complete({ ...input, submission: parsed.data });
  }

  fail(input: Parameters<SabangnetMallListingsPort['fail']>[0]) {
    return this.repository.fail(input);
  }

  cancel(input: Parameters<SabangnetMallListingsPort['cancel']>[0]) {
    return this.repository.cancel(input);
  }
}
