import { IsArray, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class RegisterCampaignListingDto {
  @IsUUID()
  listingId: string;

  @IsOptional()
  @IsString()
  label?: string;
}

class RegisterCampaignKeywordDto {
  @IsString()
  keyword: string;

  @IsNumber()
  @Min(100)
  bidPrice: number;
}

export class RegisterCampaignDto {
  @IsString()
  campaignName: string;

  @IsString()
  adGroupName: string;

  @IsString()
  grade: string;

  @IsNumber()
  @Min(10000)
  dailyBudget: number;

  @IsString()
  operationMode: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegisterCampaignListingDto)
  listings: RegisterCampaignListingDto[];

  @IsOptional()
  @IsNumber()
  @Min(100)
  smartTargetingBid?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegisterCampaignKeywordDto)
  keywords?: RegisterCampaignKeywordDto[];

  @IsOptional()
  @IsNumber()
  @Min(100)
  nonSearchBid?: number;

  @IsOptional()
  @IsNumber()
  targetRoas?: number;
}
