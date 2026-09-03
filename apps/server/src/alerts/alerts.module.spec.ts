import { MODULE_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AlertsController } from './alerts.controller';
import { AlertsModule } from './alerts.module';
import { AlertsRepository } from './alerts.repository';
import { SourceFailureAlerts } from './alerts.service';

describe('AlertsModule wiring', () => {
  it('exposes the focused source-alert service and HTTP controller', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AlertsModule)).toContain(
      AlertsController,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AlertsModule)).toEqual(
      expect.arrayContaining([AlertsRepository, SourceFailureAlerts]),
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, AlertsModule)).toContain(
      SourceFailureAlerts,
    );
  });

  it('mounts AlertsModule in the API application', () => {
    const applicationModule = readFileSync(
      new URL('../api-application.module.ts', import.meta.url),
      'utf8',
    );
    expect(applicationModule).toMatch(/import \{ AlertsModule \} from ['"]\.\/alerts\/alerts\.module['"]/);
    expect(applicationModule).toMatch(/imports:\s*\[[\s\S]*\bAlertsModule\b/);
  });
});
