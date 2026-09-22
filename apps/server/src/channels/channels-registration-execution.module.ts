import { Module } from '@nestjs/common';
import { SalesProductModule } from './sales-product.module';
import { ChannelOptionRecipeModule } from './channel-option-recipe.module';
import { RegistrationTargetExecutionController } from './adapter/in/web/registration-target-execution.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ChannelsRegistrationPreparationModule } from './channels-registration-preparation.module';
import { ChannelsModule } from './channels.module';
import { ChannelRegistrationExecutionController } from './adapter/in/http/channel-registration-execution.controller';
import { RegistrationExecutionRepositoryAdapter } from './adapter/out/repository/registration-execution.repository.adapter';
import { RegistrationExecutionService } from './application/service/registration-execution.service';
import { REGISTRATION_EXECUTION_PORT } from './application/port/in/capability/registration-execution.port';
import { REGISTRATION_EXECUTION_REPOSITORY_PORT } from './application/port/out/repository/registration-execution.repository.port';

/**
 * 등록 실행 울타리([ADR-0014](../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 *
 * 계정 · 리스팅 · 영수증을 가진 `ChannelsModule` 과 초안을 가진 Sourcing 사이에
 * 따로 서 있다. 이 모듈만 실행 행을 쓴다.
 */
@Module({
  imports: [PrismaModule, ChannelsModule, ChannelsRegistrationPreparationModule, SalesProductModule, ChannelOptionRecipeModule],
  controllers: [ChannelRegistrationExecutionController, RegistrationTargetExecutionController],
  providers: [
    RegistrationExecutionRepositoryAdapter,
    RegistrationExecutionService,
    {
      provide: REGISTRATION_EXECUTION_REPOSITORY_PORT,
      useExisting: RegistrationExecutionRepositoryAdapter,
    },
    { provide: REGISTRATION_EXECUTION_PORT, useExisting: RegistrationExecutionService },
  ],
  exports: [REGISTRATION_EXECUTION_PORT, REGISTRATION_EXECUTION_REPOSITORY_PORT],
})
export class ChannelsRegistrationExecutionModule {}
