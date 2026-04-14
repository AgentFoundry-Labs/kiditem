import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto';

/**
 * `/chat/copilot` (및 sub-path) 는 main.ts 에서 Express `app.use` 로 직접
 * 등록함 (CopilotKit 런타임이 내부 Hono 라우터로 `/info` 등 sub-path 를 처리
 * → Nest `@All('copilot')` 은 정확 매치라 sub-path 404 발생). 여기선 Nest 로
 * 받지 않음.
 */
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
}
