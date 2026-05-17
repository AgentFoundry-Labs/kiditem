import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ChannelAccountQueryService {
  constructor(private readonly prisma: PrismaService) {}

  listActive(organizationId: string) {
    return this.prisma.channelAccount.findMany({
      where: { organizationId, status: 'active' },
      orderBy: [{ channel: 'asc' }, { isPrimary: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        channel: true,
        name: true,
        externalAccountId: true,
        vendorId: true,
        sellerId: true,
        isPrimary: true,
      },
    });
  }
}
