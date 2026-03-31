import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateWorkflowBodyDto } from './create-workflow.dto';

export class UpdateWorkflowBodyDto extends PartialType(
  OmitType(CreateWorkflowBodyDto, ['companyId'] as const),
) {}
