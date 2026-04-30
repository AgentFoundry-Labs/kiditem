import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkflowBodyDto } from './create-workflow.dto';

export class UpdateWorkflowBodyDto extends PartialType(CreateWorkflowBodyDto) {}
