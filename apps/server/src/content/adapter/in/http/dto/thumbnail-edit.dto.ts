import {
  IsArray,
  IsEmpty,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class EditJobsDto {
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
  @IsIn(['compliance', 'quality'])
  purpose?: 'compliance' | 'quality';

  @IsOptional()
  @IsIn(['auto', 'with-box', 'no-box'])
  variantKey?: 'auto' | 'with-box' | 'no-box';
}

export class ReEditDto {
  @IsOptional()
  @IsIn(['compliance', 'quality'])
  purpose?: 'compliance' | 'quality';

  @IsOptional()
  @IsIn(['auto', 'with-box', 'no-box'])
  variantKey?: 'auto' | 'with-box' | 'no-box';
}

export class DeleteCandidateDto {
  @IsUUID()
  assetId!: string;
}

export class CancelThumbnailGenerationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
