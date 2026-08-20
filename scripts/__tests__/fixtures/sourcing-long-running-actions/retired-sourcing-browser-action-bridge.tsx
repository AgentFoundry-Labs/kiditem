import { sendToExtension } from '@/lib/extension-bridge';

export function collect() {
  return sendToExtension('sourcing-extension', {
    action: 'start1688TrendCollection',
  });
}
