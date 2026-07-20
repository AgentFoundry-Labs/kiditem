import { Module } from '@nestjs/common';
import { DeletionPasswordController } from './deletion-password.controller';
import { DeletionPasswordService } from './deletion-password.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController, DeletionPasswordController],
  providers: [OrganizationsService, DeletionPasswordService],
  // 파괴적 동작(예: 채널 상품 삭제) 게이트가 조직 스코프 비밀번호를 검증할 수 있게 공개한다.
  exports: [DeletionPasswordService],
})
export class OrganizationsModule {}
