export class LegacyRisingController {
  @Post('detect')
  detect() {
    return null;
  }
}

declare function Post(path: string): MethodDecorator;
