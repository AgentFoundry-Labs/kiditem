import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(limit?: number) {
    try {
      return await this.prisma.alert.findMany({
        where: { isRead: false },
        orderBy: { createdAt: 'desc' },
        ...(limit ? { take: limit } : {}),
      });
    } catch {
      throw new InternalServerErrorException('알림 데이터 조회 실패');
    }
  }

  async markAsRead(id: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('알림을 찾을 수 없습니다.');
    return this.prisma.alert.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead() {
    const result = await this.prisma.alert.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }
}
