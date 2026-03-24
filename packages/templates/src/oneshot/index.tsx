import type { DetailPageData } from '../types';

interface OneshotProps {
  data: DetailPageData;
}

export function Oneshot({ data: d }: OneshotProps) {
  const oneshotImage = d.detailImages[0];

  return (
    <div
      style={{
        fontFamily: "'Pretendard', sans-serif",
        wordBreak: 'keep-all',
      }}
      className="w-full max-w-[860px] mx-auto bg-white"
    >
      {oneshotImage && (
        <img
          src={oneshotImage}
          alt={d.title}
          className="w-full h-auto block"
        />
      )}
    </div>
  );
}
