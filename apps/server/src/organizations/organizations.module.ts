import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { AgentTasksController } from './agent-tasks.controller';
import { AgentTasksService } from './agent-tasks.service';

@Module({
  controllers: [OrganizationsController, AgentTasksController],
  providers: [OrganizationsService, AgentTasksService],
})
export class OrganizationsModule {}
