import { AlertTriangle } from 'lucide-react';

interface TraceWarningBannerProps {
  message: string;
}

export function TraceWarningBanner({ message }: TraceWarningBannerProps) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <p>{message}</p>
    </div>
  );
}
