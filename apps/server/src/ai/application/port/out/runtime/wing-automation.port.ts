/**
 * Outgoing port for Coupang Wing browser automation.
 *
 * Application services depend on this contract, not on the concrete
 * Playwriter-backed `WingAutomationRunner` adapter. This keeps the Wing
 * registration use-case orchestration testable with a fake runner and isolates
 * the external browser-automation lifetime from the use-case body.
 *
 * Bound in `ai.module.ts` to the concrete `WingAutomationRunner` provider via
 * `WING_AUTOMATION_PORT` token.
 */

export const WING_AUTOMATION_PORT = Symbol('WING_AUTOMATION_PORT');

export interface WingUploadInput {
  productName: string;
  imagePath: string;
  screenshotPath: string;
}

export interface WingUploadResult {
  success: boolean;
  error?: string;
}

export interface PlaywriterStatus {
  connected: boolean;
  error?: string;
}

export interface WingAutomationPort {
  runWingUpload(input: WingUploadInput): Promise<WingUploadResult>;
  checkPlaywriterStatus(): Promise<PlaywriterStatus>;
}
