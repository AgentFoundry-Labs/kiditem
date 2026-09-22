import { describe, expect, it, vi } from 'vitest';
import { AiDirectJobWakeRegistrationService } from '../ai-direct-job-wake-registration.service';

describe('AiDirectJobWakeRegistrationService', () => {
  it('connects runtime-owned enqueue services to the API-owned worker', () => {
    const worker = { wake: vi.fn() };
    const detailJobs = { attachWakePort: vi.fn() };
    const thumbnailJobs = { attachWakePort: vi.fn() };
    const registration = new AiDirectJobWakeRegistrationService(
      worker as never,
      detailJobs as never,
      thumbnailJobs as never,
    );

    registration.onModuleInit();

    expect(detailJobs.attachWakePort).toHaveBeenCalledWith(worker);
    expect(thumbnailJobs.attachWakePort).toHaveBeenCalledWith(worker);
  });
});
