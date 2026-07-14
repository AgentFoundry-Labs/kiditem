import { IsArray, IsBoolean, IsEmpty, IsIn, IsOptional, IsString } from 'class-validator';

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

export class SelectCandidateDto {
  @IsString()
  selectedUrl!: string;
}

export class DeleteCandidateDto {
  @IsString()
  url!: string;
}

export class WingRegisterBatchDto {
  @IsArray()
  @IsString({ each: true })
  generationIds!: string[];
}

export class WingRegisterCompleteDto {
  @IsString()
  attemptId!: string;

  @IsBoolean()
  success!: boolean;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  screenshotUrl?: string;
}
