import { Controller, All, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { CopilotKitService } from './copilotkit.service';

@Controller('copilotkit')
export class CopilotKitController {
  constructor(private readonly copilotKitService: CopilotKitService) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.copilotKitService.handleRequest(req, res);
  }
}
