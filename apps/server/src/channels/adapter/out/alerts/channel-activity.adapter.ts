import { Injectable, Logger } from '@nestjs/common';
import type { ChannelActivityPort } from '../../../application/port/out/alerts/channel-activity.port';

@Injectable()
export class ChannelActivityAdapter implements ChannelActivityPort {
  private readonly logger = new Logger('Channels');
  log(message: string): void { this.logger.log(message); }
  warn(message: string, details?: unknown): void { this.logger.warn(message, details); }
}
