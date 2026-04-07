import { Controller, Post, Body, Res, All, Req } from '@nestjs/common';
import { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  chat(@Body() dto: ChatRequestDto, @Res() res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    this.chatService.stream(dto.message, dto.sessionId).subscribe({
      next: (event) => res.write(`data: ${JSON.stringify(event.data)}\n\n`),
      complete: () => res.end(),
      error: (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`);
        res.end();
      },
    });
  }

  @All('copilot')
  async copilot(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.chatService.handleCopilotRequest(req, res);
  }
}
