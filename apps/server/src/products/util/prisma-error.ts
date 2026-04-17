// apps/server/src/products/util/prisma-error.ts
import { Prisma } from '@prisma/client';
import {
  BadRequestException, ConflictException, NotFoundException,
} from '@nestjs/common';

export function mapPrismaError(e: unknown, context: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      const target = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'unknown';
      throw new ConflictException(`${context}: duplicate ${target}`);
    }
    if (e.code === 'P2003') {
      throw new BadRequestException(`${context}: related resource not found`);
    }
    if (e.code === 'P2025') {
      throw new NotFoundException(`${context}: record not found`);
    }
  }
  throw e;
}
