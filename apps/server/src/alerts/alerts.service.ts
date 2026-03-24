import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    try {
      return await this.prisma.alert.findMany({
        where: { isRead: false },
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      throw new InternalServerErrorException('알림 데이터 조회 실패');
    }
  }
}
