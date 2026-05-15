export function formatElapsed(seconds: number): string {
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초`
    : `${seconds}초`;
}
