import { Injectable } from '@nestjs/common';
import type { AgentOsPlatformProbeCapabilityPort } from '../../../application/port/in/capability/platform-probe.port';

@Injectable()
export class AgentOsPlatformProbeCapabilityAdapter implements AgentOsPlatformProbeCapabilityPort {
  async platformProbe(): Promise<{ status: 'available' }> {
    return { status: 'available' };
  }
}
