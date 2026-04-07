import { IsString, IsArray, IsUUID } from 'class-validator';

export class GenerateThumbnailDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  productIds: string[];
}

export class SelectCandidateDto {
  @IsString()
  selectedUrl: string;
}
