import type { HermesTranscriptEvent } from './hermes-runtime-output';

const MAX_TRANSCRIPT_EVENTS = 20;
const MAX_TRANSCRIPT_MESSAGE_CHARS = 2_000;

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function hermesTranscriptEventData(
  events: HermesTranscriptEvent[] | undefined,
): { transcriptEvents?: Record<string, unknown>[] } {
  if (!events?.length) return {};

  return {
    transcriptEvents: events.slice(-MAX_TRANSCRIPT_EVENTS).map((event) => {
      const message = truncate(event.message, MAX_TRANSCRIPT_MESSAGE_CHARS);
      const type = stringField(event.data.type);
      const line = numberField(event.data.line);
      const durationMs = numberField(event.data.durationMs);
      return {
        type: event.type,
        message,
        data: {
          ...(type === undefined ? {} : { type }),
          ...(line === undefined ? {} : { line }),
          ...(durationMs === undefined ? {} : { durationMs }),
          truncated: message.length !== event.message.length,
        },
      };
    }),
  };
}
