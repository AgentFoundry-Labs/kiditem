import { IsObject, IsNotEmpty } from 'class-validator';

export class UpdateDraftContentBodyDto {
  @IsObject()
  @IsNotEmpty()
  draftContent: Record<string, unknown>;
}
