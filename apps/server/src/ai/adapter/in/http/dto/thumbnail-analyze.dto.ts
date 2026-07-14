import { IsArray, IsEmpty, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';
import type { AnalysisScope } from '../../../../application/service/thumbnail-analysis-requests';

export type { AnalysisScope };

export class AnalyzeThumbnailDto {
  @IsEmpty({
    message: 'productId는 제거되었습니다. contentWorkspaceId를 사용하세요',
  })
  productId?: never;

  @IsEmpty({
    message: 'masterId는 제거되었습니다. contentWorkspaceId를 사용하세요',
  })
  masterId?: never;

  @IsOptional()
  @IsString()
  contentWorkspaceId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsIn(['all', 'quality', 'compliance'])
  scope?: AnalysisScope;
}

export class AnalyzeBatchDto {
  @IsEmpty({
    message: 'productIds는 제거되었습니다. contentWorkspaceIds를 사용하세요',
  })
  productIds?: never;

  @IsEmpty({
    message: 'masterIds는 제거되었습니다. contentWorkspaceIds를 사용하세요',
  })
  masterIds?: never;

  @IsArray()
  @IsString({ each: true })
  contentWorkspaceIds!: string[];

  @IsOptional()
  @IsIn(['all', 'quality', 'compliance'])
  scope?: AnalysisScope;
}

export class CheckImageSpecDto {
  @IsUrl({ require_tld: false })
  imageUrl!: string;
}

export class PreInspectDto {
  @IsEmpty({
    message: 'productIds는 제거되었습니다. contentWorkspaceIds를 사용하세요',
  })
  productIds?: never;

  @IsEmpty({
    message: 'masterIds는 제거되었습니다. contentWorkspaceIds를 사용하세요',
  })
  masterIds?: never;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentWorkspaceIds?: string[];
}
