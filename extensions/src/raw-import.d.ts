// Vite/Vitest `?raw` import — 스펙이 커밋된 번들 파일을 문자열로 읽는다.
declare module '*?raw' {
  const source: string;
  export default source;
}
