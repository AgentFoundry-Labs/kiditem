import { Sparkles } from 'lucide-react';

export default function GenerateLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/10 p-6 backdrop-blur-[2px]">
      <div className="flex w-full max-w-[460px] flex-col items-center rounded-2xl border border-slate-200 bg-white/95 px-8 py-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 h-14 w-14 animate-spin rounded-full border-[6px] border-violet-500/20 border-t-violet-600" />
        <p className="mb-3 flex items-center gap-2 text-xl font-black text-violet-700">
          <Sparkles size={24} />
          AI 상세페이지 초안 생성 중
        </p>
        <p className="text-sm font-bold leading-6 text-slate-700">
          카피, 구성, 섹션별 이미지를 만들고 있어요.
          <br />
          이미지가 적으면 구도 변경 컷까지 만들어 약 60~90초 정도 걸립니다.
        </p>
      </div>
    </div>
  );
}
