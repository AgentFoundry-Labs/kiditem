import { IsUUID } from 'class-validator';

export class ListProductMemosQueryDto {
  @IsUUID() productId: string;
}
