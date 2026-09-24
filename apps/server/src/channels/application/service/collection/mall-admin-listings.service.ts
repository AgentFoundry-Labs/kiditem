import { ChannelInputError as BadRequestException } from '../../../domain/exception/channel-business-error';
import {
  MallAdminListingsBeginSchema,
  MallAdminListingsSubmissionSchema,
} from '@kiditem/shared/mall-admin-listings';
import type { MallAdminListingsPort } from '../../port/in/mall-admin-listings.port';
import {
  MALL_ADMIN_LISTINGS_REPOSITORY_PORT,
  type MallAdminListingsRepositoryPort,
} from '../../port/out/repository/mall-admin-listings.repository.port';


export class MallAdminListingsService implements MallAdminListingsPort {
  constructor(

    private readonly repository: MallAdminListingsRepositoryPort,
  ) {}

  begin(input: Parameters<MallAdminListingsPort['begin']>[0]) {
    const parsed = MallAdminListingsBeginSchema.safeParse(input.request);
    if (!parsed.success) throw new BadRequestException('MALL_ADMIN_PLAN_INVALID');
    return this.repository.begin({ ...input, request: parsed.data });
  }

  readAttempt(input: Parameters<MallAdminListingsPort['readAttempt']>[0]) {
    return this.repository.readAttempt(input);
  }

  readSource(input: Parameters<MallAdminListingsPort['readSource']>[0]) {
    return this.repository.readSource(input);
  }

  complete(input: Parameters<MallAdminListingsPort['complete']>[0]) {
    const parsed = MallAdminListingsSubmissionSchema.safeParse(input.submission);
    if (!parsed.success) throw new BadRequestException('MALL_ADMIN_EVIDENCE_INVALID');
    return this.repository.complete({ ...input, submission: parsed.data });
  }

  fail(input: Parameters<MallAdminListingsPort['fail']>[0]) {
    return this.repository.fail(input);
  }

  cancel(input: Parameters<MallAdminListingsPort['cancel']>[0]) {
    return this.repository.cancel(input);
  }
}
