import { IsString, IsOptional } from 'class-validator';

export class CreateCsBodyDto {
  @IsString() csType: string;
  @IsString() content: string;
  @IsString() @IsOptional() priority?: string;
  @IsString() @IsOptional() assignee?: string;
  @IsString() @IsOptional() orderId?: string;
  @IsString() @IsOptional() productId?: string;
}
