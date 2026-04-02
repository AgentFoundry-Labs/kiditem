import { Module } from '@nestjs/common';
import { AgentRegistryModule } from '../agent-registry/agent-registry.module';
import { SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';

@Module({
  imports: [AgentRegistryModule],
  controllers: [SourcingController],
  providers: [SourcingService],
})
export class SourcingModule {}
