import { IsString, IsOptional } from 'class-validator';

/**
 * 기존 스토리지 객체(예: 편집기 AI 결과)를 상품 허브로 복사할 때 사용.
 *
 * POST /api/products/:id/images/save-from-url
 */
export class SaveFromUrlDto {
  @IsString()
  url: string;

  @IsString()
  role: string;

  @IsOptional()
  @IsString()
  label?: string;
}
