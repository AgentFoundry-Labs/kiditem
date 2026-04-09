import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateActivityEventInput {
  companyId: string;
  objectType: string;
  objectId: string;
  eventType: string;
  source: string;
  title: string;
  data?: Record<string, any>;
}

@Injectable()
export class ActivityEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateActivityEventInput) {
    return this.prisma.activityEvent.create({
      data: data as any,
    });
  }

  async createMany(events: CreateActivityEventInput[]) {
    return this.prisma.activityEvent.createMany({
      data: events as any[],
    });
  }

  async findByObject(objectType: string, objectId: string, opts?: { eventType?: string; limit?: number }) {
    return this.prisma.activityEvent.findMany({
      where: {
        objectType,
        objectId,
        ...(opts?.eventType && { eventType: opts.eventType }),
      },
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 50,
    });
  }

  async findByCompany(
    companyId: string,
    query: { objectType?: string; eventType?: string; limit?: number },
  ) {
    return this.prisma.activityEvent.findMany({
      where: {
        companyId,
        ...(query.objectType && { objectType: query.objectType }),
        ...(query.eventType && { eventType: query.eventType }),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });
  }
}
