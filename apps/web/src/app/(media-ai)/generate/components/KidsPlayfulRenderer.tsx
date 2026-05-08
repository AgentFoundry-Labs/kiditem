/**
 * KidsPlayfulRenderer
 *
 * packages/templates/src/kids-playful/index.tsx 의 정적 reference 코드를 가져와
 * 11 개 섹션을 props (KidsPlayfulData) 기반으로 렌더하도록 변환한 컴포넌트.
 *
 * - 각 섹션의 카피 / 이미지 URL 모두 props 에서 옴.
 * - imageUrl 이 null 이면 회색 placeholder 박스로 fallback.
 * - section11.symbolCard.icon 은 lucide 아이콘 이름 (string) 으로 들어옴 → 동적 매핑.
 *
 * Footer (배송/교환/상품정보) 는 정형 블록이라 일단 reference 그대로. 나중에
 * 사용자 입력 기반 동적화 가능.
 */
'use client';

/* eslint-disable @next/next/no-img-element */
import {
  Activity,
  Book,
  Car,
  Heart,
  Info,
  Pencil,
  Sparkles,
  Star,
  ToyBrick,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { KidsPlayfulData } from '../lib/kids-playful-types';

const ICON_MAP: Record<string, LucideIcon> = {
  Waves,
  Sparkles,
  Pencil,
  ToyBrick,
  Heart,
  Car,
  Book,
  Activity,
};

interface Props {
  data: KidsPlayfulData;
}

const ReviewStars = () => (
  <div className="flex justify-center gap-1 mb-2">
    {[...Array(5)].map((_, i) => (
      <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
    ))}
  </div>
);

const PainPointCard = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-4">
    <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
      <div className="w-3 h-3 rounded-full bg-red-400"></div>
      <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
      <div className="w-3 h-3 rounded-full bg-green-400"></div>
    </div>
    <div className="px-6 py-10 text-center">
      <p className="text-gray-500 font-medium mb-2 text-lg">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{subtitle}</p>
    </div>
  </div>
);

const KeyPointTag = () => (
  <div className="bg-slate-800 text-white px-6 py-2 rounded-full inline-block font-bold text-xl mb-6 shadow-sm">
    KeyPoint
  </div>
);

/** imageUrl null 이면 회색 placeholder. */
function Img({
  src,
  alt,
  className,
  fallbackHint,
}: {
  src: string | null;
  alt: string;
  className?: string;
  fallbackHint?: string;
}) {
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-200 text-gray-400 text-xs ${className ?? ''}`}
      >
        {fallbackHint ?? '이미지 없음'}
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} />;
}

/** headlineLine2 안에서 emphasis 부분만 색 강조. */
function HighlightedHeadline({
  text,
  emphasis,
  emphasisClass,
}: {
  text: string;
  emphasis: string;
  emphasisClass: string;
}) {
  if (!emphasis || !text.includes(emphasis)) {
    return <>{text}</>;
  }
  const parts = text.split(emphasis);
  return (
    <>
      {parts[0]}
      <span className={emphasisClass}>{emphasis}</span>
      {parts.slice(1).join(emphasis)}
    </>
  );
}

export default function KidsPlayfulRenderer({ data }: Props) {
  const SymbolIcon = ICON_MAP[data.section11.symbolCard.icon] ?? Sparkles;
  const symbolImageUrl =
    data.section10.cards.find((card) => card.imageUrl)?.imageUrl ??
    data.section8.blocks.find((block) => block.imageUrl)?.imageUrl ??
    data.section7.imageUrl ??
    data.section5.imageUrl ??
    data.section11.galleryImageUrls[0] ??
    data.section11.galleryImageUrls[1] ??
    null;

  return (
    <div className="bg-[#e5e7eb] min-h-screen text-gray-900 font-sans break-keep antialiased pb-20">
      <div className="max-w-[720px] mx-auto bg-white shadow-2xl relative w-full overflow-hidden">
        {/* Section 1: Hero */}
        <section className="relative pt-20 pb-0 bg-gradient-to-b from-[#1a1a1a] to-[#2d2d2d]">
          <div className="px-6 text-center text-white relative z-10 mb-12">
            <h2 className="text-xl md:text-2xl font-medium mb-2 text-gray-300">
              {data.section1.subhead}
            </h2>
            <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-8">
              {data.section1.mainHeadline}
            </h1>
          </div>
          <div className="relative w-full aspect-[4/3] bg-blue-100">
            <Img
              src={data.section1.heroImageUrl}
              alt="Hero"
              className="w-full h-full object-cover"
              fallbackHint="hero"
            />
            <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-gray-900 to-transparent"></div>
          </div>
        </section>

        {/* Section 2: Reviews */}
        <section className="bg-gray-900 py-20 px-6 relative">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">찐 사용 후기</h2>
            <div className="w-16 h-1 bg-blue-500 mx-auto rounded-full mt-4"></div>
          </div>
          <div className="space-y-4 max-w-sm mx-auto">
            {data.section2.reviews.map((r, i) => (
              <div
                key={i}
                className={`bg-red-500 text-white p-6 rounded-[2rem] text-center shadow-lg transform ${
                  ['rotate-[-1deg]', 'rotate-[1deg]', 'rotate-[-0.5deg]', 'rotate-[0.5deg]'][i % 4]
                }`}
              >
                <ReviewStars />
                <p className="text-lg font-bold">
                  {r.headline}
                  <br />
                  {r.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Usage 200% */}
        <section className="py-24 px-6 bg-white">
          <div className="text-center mb-16 space-y-4">
            <p className="text-xl font-bold text-gray-500">{data.section3.label}</p>
            <h2 className="text-5xl font-black">{data.section3.headline}</h2>
            <p className="text-2xl font-bold text-gray-800">{data.section3.subhead}</p>
          </div>

          <div className="space-y-12">
            {data.section3.scenarios.map((s, i) => (
              <div
                key={i}
                className="relative rounded-2xl overflow-hidden shadow-xl aspect-video group"
              >
                <Img
                  src={s.imageUrl}
                  alt={s.caption}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  fallbackHint={`scenario ${i + 1}`}
                />
                <div className="absolute inset-0 bg-black/30 flex items-end justify-center pb-8">
                  <p className="text-white text-2xl font-bold drop-shadow-md text-center px-4">
                    {s.caption}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Pain Points */}
        <section className="py-24 px-6 bg-gray-900">
          <div className="text-center mb-16 space-y-4">
            <p className="text-xl text-gray-300 font-medium">{data.section4.intro.line1}</p>
            <p className="text-2xl text-gray-300 font-bold">{data.section4.intro.line2}</p>
            <h2 className="text-5xl font-black text-red-500">{data.section4.intro.line3}</h2>
          </div>

          <div className="max-w-md mx-auto space-y-6 relative z-10">
            {data.section4.cards.map((c, i) => (
              <PainPointCard key={i} title={c.title} subtitle={c.subtitle} />
            ))}
          </div>

          <div className="mt-16 -mx-6 h-72 relative opacity-60">
            <Img
              src={data.section4.moodImageUrl}
              alt="Pain mood"
              className="w-full h-full object-cover grayscale"
              fallbackHint="pain mood"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent"></div>
          </div>
        </section>

        {/* Section 5: Solution */}
        <section className="py-24 px-6 bg-white text-center">
          <h2 className="text-4xl md:text-5xl font-black mb-6 leading-tight">
            {data.section5.headlineLine1}
            <br />
            {data.section5.headlineLine2}
          </h2>
          <p className="text-xl text-gray-600 mb-16 leading-relaxed font-medium">
            {data.section5.subcopy[0]}
            <br />
            {data.section5.subcopy[1]}
            <br />
            {data.section5.subcopy[2]}
          </p>
          <div className="aspect-[4/5] md:aspect-video rounded-3xl overflow-hidden shadow-2xl">
            <Img
              src={data.section5.imageUrl}
              alt="Solution"
              className="w-full h-full object-cover"
              fallbackHint="solution"
            />
          </div>
        </section>

        {/* Section 6: Features */}
        <section className="py-24 px-6 bg-blue-50/50">
          <div className="text-center mb-16">
            <p className="text-blue-600 font-bold text-xl mb-4">{data.section6.label}</p>
            <h2 className="text-3xl font-bold mb-4">{data.section6.headline}</h2>
            <p className="text-5xl font-black text-blue-600">{data.section6.bigHeadline}</p>
          </div>

          <div className="space-y-8 max-w-lg mx-auto">
            {data.section6.cards.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-6 bg-white p-4 rounded-3xl shadow-sm border border-gray-100"
              >
                <div className="flex-1 px-4">
                  <p className="text-3xl text-blue-500 font-bold mb-1">{c.num}</p>
                  <p className="text-sm text-gray-500 mb-1">{c.title}</p>
                  <p className="text-2xl font-bold">{c.subtitle}</p>
                </div>
                <div className="w-32 h-32 rounded-2xl overflow-hidden shrink-0 shadow-inner">
                  <Img
                    src={c.imageUrl}
                    alt={c.subtitle}
                    className="w-full h-full object-cover"
                    fallbackHint={c.title}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 7: KeyPoint 1 */}
        <section className="py-24 px-6 bg-white text-center">
          <KeyPointTag />
          <h2 className="text-4xl md:text-5xl font-black leading-tight mb-12">
            {data.section7.headlineLine1}
            <br />
            <HighlightedHeadline
              text={data.section7.headlineLine2}
              emphasis={data.section7.emphasisInLine2}
              emphasisClass="text-blue-600"
            />
          </h2>
          <div className="space-y-2 text-lg text-gray-600 mb-12 font-medium">
            <p>{data.section7.body1}</p>
            <p>{data.section7.body2}</p>
            <p className="text-black font-bold text-xl mt-6">{data.section7.bodyEmphasis}</p>
          </div>

          <div className="w-full aspect-[3/4] md:aspect-square bg-gray-100 rounded-b-[4rem] rounded-t-xl overflow-hidden relative">
            <Img
              src={data.section7.imageUrl}
              alt="KeyPoint 1"
              className="w-full h-full object-cover object-top"
              fallbackHint="keypoint 1"
            />
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-1 h-32 bg-blue-600"></div>
          </div>
        </section>

        {/* Section 8: Blue Section */}
        <section className="py-24 px-6 bg-blue-600 text-white text-center">
          <p className="text-xl font-medium text-blue-100 mb-4">{data.section8.introLine1}</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-6">{data.section8.introLine2}</h2>
          <h2 className="text-4xl md:text-5xl font-black mb-20 whitespace-nowrap">
            {data.section8.introLine3}
          </h2>

          {data.section8.blocks.map((b, i) => (
            <div key={i} className={i === 0 ? 'mb-24' : 'mb-10'}>
              <div className="inline-block bg-white text-blue-600 font-bold px-8 py-3 rounded-full text-xl mb-8 shadow-xl">
                {b.pillLabel}
              </div>
              <h3 className="text-5xl font-black mb-6 leading-tight whitespace-pre-line">
                {b.headline}
              </h3>
              <p className="text-xl text-blue-100 font-medium mb-10 leading-relaxed whitespace-pre-line">
                {b.body}
              </p>
              <div
                className={`${
                  i === 0 ? 'aspect-[4/3]' : 'aspect-[4/5]'
                } rounded-3xl overflow-hidden shadow-2xl border-4 border-white/20 ${
                  i === 1 ? 'bg-blue-400' : ''
                }`}
              >
                <Img
                  src={b.imageUrl}
                  alt={b.pillLabel}
                  className="w-full h-full object-cover"
                  fallbackHint={b.pillLabel}
                />
              </div>
            </div>
          ))}
        </section>

        {/* Section 9: KeyPoint 2 */}
        <section className="py-24 px-6 bg-white text-center pb-0">
          <KeyPointTag />
          <p className="text-3xl font-bold mb-4">{data.section9.smallHeadline}</p>
          <h2 className="text-5xl font-black mb-10 leading-tight">
            {data.section9.bigHeadline.line1}
            <br />
            {data.section9.bigHeadline.line2} <br />
            <span className="text-blue-600 leading-none">
              <HighlightedHeadline
                text={data.section9.bigHeadline.line3}
                emphasis={data.section9.emphasisInLine3}
                emphasisClass=""
              />
            </span>
          </h2>

          <div className="text-gray-600 font-medium text-lg mb-16 space-y-2">
            <p>{data.section9.body[0]}</p>
            <p>{data.section9.body[1]}</p>
          </div>
        </section>

        {/* Section 10: Lifestyles */}
        <section className="bg-white">
          {data.section10.cards.map((c, i) => {
            // 3 카드의 디자인이 reference 에서 다 다름 (밝은/어두운/그라디언트).
            // 인덱스별 분기.
            if (i === 0) {
              return (
                <div key={i}>
                  <div className="relative">
                    <Img
                      src={c.imageUrl}
                      alt={c.smallHeadline}
                      className="w-full h-[500px] object-cover"
                      fallbackHint={c.smallHeadline}
                    />
                    <div className="pointer-events-none absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-white to-transparent"></div>
                  </div>
                  <div className="px-6 pt-16 pb-16 text-center relative z-10 -mt-24">
                    <p className="text-2xl font-bold mb-2">{c.smallHeadline}</p>
                    <h2 className="text-5xl font-black tracking-tight leading-tight mb-4">
                      {c.bigHeadlineLine1}
                      <br />
                      <span className="text-blue-600">{c.bigHeadlineLine2}</span>
                    </h2>
                  </div>
                </div>
              );
            }
            if (i === 1) {
              return (
                <div key={i} className="px-6 py-20 text-right mt-10 text-white relative">
                  <Img
                    src={c.imageUrl}
                    alt={c.smallHeadline}
                    className="inset-0 absolute w-full h-[800px] object-cover brightness-[0.7]"
                    fallbackHint={c.smallHeadline}
                  />
                  <div className="relative z-10 pt-16">
                    <p className="text-2xl font-bold mb-2">{c.smallHeadline}</p>
                    <h2 className="text-5xl font-black leading-tight mb-4 tracking-tight">
                      {c.bigHeadlineLine1}
                      <br />
                      <span className="text-blue-300">{c.bigHeadlineLine2}</span>
                    </h2>
                  </div>
                  <div className="h-[400px]"></div>
                </div>
              );
            }
            return (
              <div
                key={i}
                className="px-6 py-32 text-center relative bg-gradient-to-b from-[#e1edf9] to-white mt-10"
              >
                <p className="text-2xl font-bold mb-2">{c.smallHeadline}</p>
                <h2 className="text-5xl font-black leading-tight mb-16 tracking-tight">
                  {c.bigHeadlineLine1}
                  <br />
                  <span className="text-blue-600">{c.bigHeadlineLine2}</span>
                </h2>
                <div className="rounded-3xl overflow-hidden shadow-xl aspect-[3/4] md:aspect-square">
                  <Img
                    src={c.imageUrl}
                    alt={c.smallHeadline}
                    className="w-full h-full object-cover"
                    fallbackHint={c.smallHeadline}
                  />
                </div>
              </div>
            );
          })}
        </section>

        {/* Section 11: Gallery / Conclusion */}
        <section className="bg-gray-100 flex flex-col gap-2 relative">
          <Img
            src={data.section11.galleryImageUrls[0]}
            alt="Gallery 1"
            className="w-full aspect-[4/3] object-cover"
            fallbackHint="gallery 1"
          />

          <div className="relative w-full aspect-[4/3] bg-blue-500 overflow-hidden p-10">
            <Img
              src={symbolImageUrl}
              alt={data.section11.symbolCard.text}
              className="absolute inset-0 w-full h-full object-cover brightness-[0.72]"
              fallbackHint={data.section11.symbolCard.text}
            />
            <div className="absolute inset-0 bg-blue-600/45"></div>
            <div className="relative z-10 bg-white/10 w-full h-full rounded-3xl backdrop-blur-sm border border-white/20 shadow-2xl overflow-hidden flex flex-col items-center justify-center">
              <SymbolIcon className="w-32 h-32 text-white/70 mb-6" />
              <p className="text-white text-2xl font-black tracking-widest opacity-70">
                {data.section11.symbolCard.text}
              </p>
            </div>
          </div>

          <Img
            src={data.section11.galleryImageUrls[1]}
            alt="Gallery 2"
            className="w-full aspect-video object-cover"
            fallbackHint="gallery 2"
          />

          <div className="bg-[#dfd9c9] py-24 px-6 text-center text-[#4a4030]">
            <div className="space-y-4 font-medium text-xl leading-relaxed mb-10">
              <p>{data.section11.closing.body[0]}</p>
              <p>{data.section11.closing.body[1]}</p>
            </div>
            <p className="text-4xl font-black">
              {data.section11.closing.headline[0]}
              <br />
              {data.section11.closing.headline[1]}
            </p>
          </div>
        </section>

        {/* Footer (정형 — 일단 placeholder) */}
        <footer className="bg-white py-20 px-6 border-t border-gray-200 text-sm break-all font-sans">
          <h2 className="text-3xl font-bold mb-10">구매/배송안내</h2>

          <div className="space-y-10 text-gray-600">
            <div>
              <h3 className="font-bold text-black text-lg mb-3 flex items-center gap-2">
                <Info className="w-5 h-5" /> 배송 안내
              </h3>
              <p className="leading-relaxed">
                결제 후 순차 발송됩니다.
                <br />
                배송일, 배송비는 옵션에서 확인
              </p>
            </div>

            <div>
              <h3 className="font-bold text-black text-lg mb-3 flex items-center gap-2">
                <Info className="w-5 h-5" /> 교환/반품 안내
              </h3>
              <p className="leading-relaxed text-xs sm:text-sm">
                단순변심 교환/반품은 상품 수령 후 7일 이내 가능하며, 사용 흔적, 가치 훼손 시
                제한될 수 있습니다.
                <br />
                특가/프로모션 상품은 변심 반품 시 왕복 배송비가 부과될 수 있습니다.
                <br />
                제품 이상은 사진과 함께 고객센터로 문의 주시면 빠르게 확인해 드립니다.
              </p>
            </div>

            <div className="pt-8 mb-10">
              <h3 className="font-bold text-black text-lg mb-3">상품 정보 고시</h3>
              <table className="w-full border-collapse text-xs md:text-sm border-t-2 border-black">
                <tbody>
                  {[
                    ['상품명', data.section1.mainHeadline],
                    ['모델명', data.section1.mainHeadline],
                    ['구성', '상세페이지 참고'],
                    ['색상', '다양한 컬러'],
                    ['사이즈', '상세페이지 참고'],
                    ['제조국', '중국'],
                    ['판매원', '판매원 표기'],
                  ].map(([label, value], i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-3 px-2 bg-gray-50 font-medium text-gray-700 w-1/3">
                        {label}
                      </td>
                      <td className="py-3 px-2 text-gray-600 font-medium">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.safetyLabelImageUrls.length > 0 && (
              <div className="space-y-4">
                {data.safetyLabelImageUrls.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt="제품 안전 품질표시"
                    className="w-full rounded-2xl border border-gray-200 shadow-sm"
                  />
                ))}
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
