import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    try {
      return await this.prisma.company.findMany({
        select: { id: true, name: true },
      });
    } catch {
      throw new InternalServerErrorException('회사 데이터 조회 실패');
    }
  }
}
