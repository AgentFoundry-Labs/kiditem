// apps/server/src/products/services/master-code.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MasterCodeService {
  static readonly MAX_VALUE = 99999999;

  constructor(private readonly prisma: PrismaService) {}

  async generate(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('master_code_seq') AS nextval
    `;
    const n = Number(rows[0].nextval);
    if (n > MasterCodeService.MAX_VALUE) {
      throw new InternalServerErrorException(
        `master_code_seq overflow: ${n} > ${MasterCodeService.MAX_VALUE}`,
      );
    }
    return `M-${String(n).padStart(8, '0')}`;
  }
}
