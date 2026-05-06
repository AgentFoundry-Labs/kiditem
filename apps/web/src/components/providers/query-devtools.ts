export function shouldRenderQueryDevtools(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS === 'true'
  );
}
