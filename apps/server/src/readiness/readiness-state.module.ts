import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [PrismaModule],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessStateModule {}
