import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompanyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(): Promise<string> {
    const company = await this.prisma.company.findFirst();
    if (!company) throw new NotFoundException('No company found');
    return company.id;
  }
}
