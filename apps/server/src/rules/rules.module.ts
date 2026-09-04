import { Module } from '@nestjs/common';
import { RuleEvaluationController } from './controllers/rule-evaluation.controller';
import { RulesManagementController } from './controllers/rules-management.controller';
import { RulesService } from './services/rules.service';
import { PrismaModule } from '../prisma/prisma.module';

// Rules owns only synchronous `/api/rules/*` evaluation + rule CRUD.
@Module({
  imports: [PrismaModule],
  controllers: [
    RuleEvaluationController,
    RulesManagementController,
  ],
  providers: [
    RulesService,
  ],
})
export class RulesModule {}
