import { Body, Controller, Get, Put } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
import { DeletionPasswordService } from './deletion-password.service';

export class SetDeletionPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

/**
 * 삭제 전용 비밀번호 관리.
 *
 * ⚠️ 응답에는 해시/솔트가 절대 포함되지 않는다. 나가는 것은 `configured` 와
 * 마지막 변경 시각뿐이다.
 */
@Controller('organizations/deletion-password')
export class DeletionPasswordController {
  constructor(private readonly deletionPassword: DeletionPasswordService) {}

  @Get()
  getStatus(@CurrentOrganization() organizationId: string) {
    return this.deletionPassword.getStatus(organizationId);
  }

  @Put()
  setPassword(
    @CurrentOrganization() organizationId: string,
    @Body() body: SetDeletionPasswordDto,
  ) {
    return this.deletionPassword.setPassword(organizationId, {
      currentPassword: body.currentPassword ?? null,
      newPassword: body.newPassword,
    });
  }
}
