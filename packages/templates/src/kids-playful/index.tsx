/**
 * Kids Playful (= 트렌드 광고형) — `super-water-gun-landing-page` 의 App.tsx 를
 * 그대로 옮긴 정적 템플릿.
 *
 * 사용자 요구: "코드 그대로 쓰라고 가져온건데 이미지 넣지 말고" — DetailPageData
 * 의 값으로 swap 하지 않고 원본 텍스트 + Unsplash 이미지 URL 그대로 유지.
 *
 * `data: DetailPageData` prop 은 받지만 이 템플릿 안에서는 무시 (호환만).
 *
 * Reference: /Users/park/Desktop/super-water-gun-landing-page/src/App.tsx
 */
/* eslint-disable @next/next/no-img-element */
import { Star, Info, Waves } from 'lucide-react';
import type { DetailPageData } from '../types';

interface Props {
  data: DetailPageData;
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

// `data` 는 받지만 무시 — reference 코드 정적으로 렌더.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function KidsPlayful(_props: Props) {
  return (
    <div className="bg-[#e5e7eb] min-h-screen text-gray-900 font-sans break-keep antialiased pb-20">
      <div className="max-w-[720px] mx-auto bg-white shadow-2xl relative w-full overflow-hidden">

        {/* Section 1: Hero */}
        <section className="relative pt-20 pb-0 bg-gradient-to-b from-[#1a1a1a] to-[#2d2d2d]">
          <div className="px-6 text-center text-white relative z-10 mb-12">
            <h2 className="text-xl md:text-2xl font-medium mb-2 text-gray-300">여름 물놀이 필수템</h2>
            <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-8">더블샷슈퍼워터건</h1>
          </div>
          <div className="relative w-full aspect-[4/3] bg-blue-100">
            <img
              src="https://images.unsplash.com/photo-1540206395-68808572332f?auto=format&fit=crop&q=80&w=1200"
              alt="Hero water play"
              className="w-full h-full object-cover"
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
            <div className="bg-red-500 text-white p-6 rounded-[2rem] text-center shadow-lg transform rotate-[-1deg]">
              <ReviewStars />
              <p className="text-lg font-bold">멀리까지 쭉!<br />압축펌프라 시원해요</p>
            </div>
            <div className="bg-red-500 text-white p-6 rounded-[2rem] text-center shadow-lg transform rotate-[1deg]">
              <ReviewStars />
              <p className="text-lg font-bold">투샷이라 다 패짐!<br />친구들이 깜짝 놀라요</p>
            </div>
            <div className="bg-red-500 text-white p-6 rounded-[2rem] text-center shadow-lg transform rotate-[-0.5deg]">
              <ReviewStars />
              <p className="text-lg font-bold">대용량이라 오래가요<br />물 보충 덜 해서 편해요</p>
            </div>
            <div className="bg-red-500 text-white p-6 rounded-[2rem] text-center shadow-lg transform rotate-[0.5deg]">
              <ReviewStars />
              <p className="text-lg font-bold">가볍고 튼튼해서 굿<br />조작도 쉬워요!</p>
            </div>
          </div>

          <div className="mt-16 -mx-6 h-64 md:h-96 relative">
            <img
              src="https://images.unsplash.com/photo-1519097787680-32d8ce5a4351?auto=format&fit=crop&q=80&w=1200"
              alt="Person playing"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-gray-900 to-transparent"></div>
          </div>
        </section>

        {/* Section 3: Usage 200% */}
        <section className="py-24 px-6 bg-white">
          <div className="text-center mb-16 space-y-4">
            <p className="text-xl font-bold text-gray-500">활용도 200%</p>
            <h2 className="text-5xl font-black">여름 물총 게임!</h2>
            <p className="text-2xl font-bold text-gray-800">물총싸움이 더 재밌게</p>
          </div>

          <div className="space-y-12">
            <div className="relative rounded-2xl overflow-hidden shadow-xl aspect-video group">
              <img
                src="https://images.unsplash.com/photo-1539604104257-2178ff0f81d1?auto=format&fit=crop&q=80&w=1200"
                alt="Outdoor water play"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/30 flex items-end justify-center pb-8">
                <p className="text-white text-2xl font-bold drop-shadow-md">야외 물놀이에서 쏘는 맛, 제대로!</p>
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden shadow-xl aspect-video group">
              <img
                src="https://images.unsplash.com/photo-1504625298404-183ff1c4fba8?auto=format&fit=crop&q=80&w=1200"
                alt="Team battle"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/30 flex items-end justify-center pb-8">
                <p className="text-white text-2xl font-bold drop-shadow-md">2분사로 승부 끝! 팀전도 꿀잼!</p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Pain points */}
        <section className="py-24 px-6 bg-gray-900">
          <div className="text-center mb-16 space-y-4">
            <p className="text-xl text-gray-300 font-medium">약한 물줄기라</p>
            <p className="text-2xl text-gray-300 font-bold">계속 끊이지 않는</p>
            <h2 className="text-5xl font-black text-red-500">물놀이참사</h2>
          </div>

          <div className="max-w-md mx-auto space-y-6 relative z-10">
            <PainPointCard title="물총 사거리 부족..." subtitle="한방이안닿아" />
            <PainPointCard title="약한 물줄기 논란..." subtitle="싸움은 늘 지는 쪽" />
            <PainPointCard title="소용량 물통 주의..." subtitle="물 금방 떨어져요" />
          </div>

          <div className="mt-16 -mx-6 h-72 relative opacity-60">
            <img
              src="https://images.unsplash.com/photo-1516585427167-9f4af9627e6c?auto=format&fit=crop&q=80&w=1200"
              alt="Disappointment"
              className="w-full h-full object-cover grayscale"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent"></div>
          </div>
        </section>

        {/* Section 5: Solution */}
        <section className="py-24 px-6 bg-white text-center">
          <h2 className="text-4xl md:text-5xl font-black mb-6 leading-tight">
            더블샷 물총<br />장거리 두발로
          </h2>
          <p className="text-xl text-gray-600 mb-16 leading-relaxed font-medium">
            압축펌프로 멀리<br />2분사로 동시에 쏴<br />역전까지 노려요
          </p>
          <div className="aspect-[4/5] md:aspect-video rounded-3xl overflow-hidden shadow-2xl">
            <img
              src="https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&q=80&w=1200"
              alt="Solution"
              className="w-full h-full object-cover"
            />
          </div>
        </section>

        {/* Section 6: Features */}
        <section className="py-24 px-6 bg-blue-50/50">
          <div className="text-center mb-16">
            <p className="text-blue-600 font-bold text-xl mb-4">물총 특징</p>
            <h2 className="text-3xl font-bold mb-4">여름 물놀이 필수!</h2>
            <p className="text-5xl font-black text-blue-600">더블샷 한방!</p>
          </div>

          <div className="space-y-8 max-w-lg mx-auto">
            {[
              {
                num: 'O',
                title: '장거리 분사',
                sub: '강력펌프',
                img: 'https://images.unsplash.com/photo-1540206395-68808572332f?auto=format&fit=crop&q=80&w=400',
              },
              {
                num: 'O',
                title: '동시 2발',
                sub: '더블노즐',
                img: 'https://images.unsplash.com/photo-1504625298404-183ff1c4fba8?auto=format&fit=crop&q=80&w=400',
              },
              {
                num: 'O',
                title: '대용량 물통',
                sub: '오래 사용',
                img: 'https://images.unsplash.com/photo-1519097787680-32d8ce5a4351?auto=format&fit=crop&q=80&w=400',
              },
            ].map((feat, i) => (
              <div
                key={i}
                className="flex items-center gap-6 bg-white p-4 rounded-3xl shadow-sm border border-gray-100"
              >
                <div className="flex-1 px-4">
                  <p className="text-3xl text-blue-500 font-bold mb-1">{feat.num}</p>
                  <p className="text-sm text-gray-500 mb-1">{feat.title}</p>
                  <p className="text-2xl font-bold">{feat.sub}</p>
                </div>
                <div className="w-32 h-32 rounded-2xl overflow-hidden shrink-0 shadow-inner">
                  <img src={feat.img} alt={feat.sub} className="w-full h-full object-cover" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 7: KeyPoint 1 */}
        <section className="py-24 px-6 bg-white text-center">
          <KeyPointTag />
          <h2 className="text-4xl md:text-5xl font-black leading-tight mb-12">
            두 개 분사구로<br />
            <span className="text-blue-600">동시에 더블샷!</span>
          </h2>
          <div className="space-y-2 text-lg text-gray-600 mb-12 font-medium">
            <p>더블샷슈퍼워터건은 압축펌프 방식!</p>
            <p>기존 물총의 약점 사거리 고민 끝</p>
            <p className="text-black font-bold text-xl mt-6">더 멀리! 더 강하게 쏴요</p>
          </div>

          <div className="w-full aspect-[3/4] md:aspect-square bg-gray-100 rounded-b-[4rem] rounded-t-xl overflow-hidden relative">
            <img
              src="https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&q=80&w=1200"
              alt="Kid having fun"
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-1 h-32 bg-blue-600"></div>
          </div>
        </section>

        {/* Section 8: Blue Section Details */}
        <section className="py-24 px-6 bg-blue-600 text-white text-center">
          <p className="text-xl font-medium text-blue-100 mb-4">두 개 분사구로 한 번에</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-6">여름 물놀이 필수템</h2>
          <h2 className="text-4xl md:text-5xl font-black mb-20 whitespace-nowrap">더블샷 슈퍼워터건</h2>

          {/* Feature 01 */}
          <div className="mb-24">
            <div className="inline-block bg-white text-blue-600 font-bold px-8 py-3 rounded-full text-xl mb-8 shadow-xl">
              01. 압축펌프
            </div>
            <h3 className="text-5xl font-black mb-6">멀리까지 쭉!</h3>
            <p className="text-xl text-blue-100 font-medium mb-10 leading-relaxed">
              강력 압축펌프로<br />장거리로 시원하게 한 방에!
            </p>
            <div className="aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-4 border-white/20">
              <img
                src="https://images.unsplash.com/photo-1539604104257-2178ff0f81d1?auto=format&fit=crop&q=80&w=1200"
                alt="Pump"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Feature 02 */}
          <div className="mb-10">
            <div className="inline-block bg-white text-blue-600 font-bold px-8 py-3 rounded-full text-xl mb-8 shadow-xl">
              02. 대용량 물통
            </div>
            <h3 className="text-5xl font-black mb-6 leading-tight">오래 놀아도<br />든든</h3>
            <p className="text-xl text-blue-100 font-medium mb-10 leading-relaxed">
              대용량 물통으로 리필 걱정 줄이고<br />더 오래, 더 신나게 즐겨요
            </p>
            <div className="aspect-[4/5] rounded-3xl overflow-hidden shadow-2xl border-4 border-white/20 bg-blue-400">
              <img
                src="https://images.unsplash.com/photo-1540206395-68808572332f?auto=format&fit=crop&q=80&w=1200"
                alt="Capacity"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* Section 9: KeyPoint 2 */}
        <section className="py-24 px-6 bg-white text-center pb-0">
          <KeyPointTag />
          <p className="text-3xl font-bold mb-4">친구들과 물총 배틀!</p>
          <h2 className="text-5xl font-black mb-10 leading-tight">
            튼튼하게<br />잡히는 <br />
            <span className="text-blue-600 leading-none">그립</span>
          </h2>

          <div className="text-gray-600 font-medium text-lg mb-16 space-y-2">
            <p>가벼워서 들고 뛰기 편하고</p>
            <p>조작도 쉬워 누구나 바로 사용!</p>
          </div>
        </section>

        {/* Section 10: Lifestyles / Attributes */}
        <section className="bg-white">
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&q=80&w=1200"
              alt="Light weight run"
              className="w-full h-[500px] object-cover"
            />
            <div className="pointer-events-none absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-white to-transparent"></div>
          </div>

          <div className="px-6 pt-16 pb-16 text-center relative z-10 -mt-24">
            <p className="text-2xl font-bold mb-2">가벼운 무게로</p>
            <h2 className="text-5xl font-black tracking-tight leading-tight mb-4">
              들고 뛰어도<br /><span className="text-blue-600">가뿐</span>
            </h2>

            <div className="mt-16 rounded-3xl overflow-hidden shadow-2xl aspect-[3/4]">
              <img
                src="https://images.unsplash.com/photo-1519097787680-32d8ce5a4351?auto=format&fit=crop&q=80&w=1200"
                alt="Lightweight"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>

          <div className="px-6 py-20 text-right mt-10 text-white relative">
            <img
              src="https://images.unsplash.com/photo-1539604104257-2178ff0f81d1?auto=format&fit=crop&q=80&w=1200"
              alt="Easy operation"
              className="inset-0 absolute w-full h-[800px] object-cover brightness-[0.7]"
            />
            <div className="relative z-10 pt-16">
              <p className="text-2xl font-bold mb-2">조작은 더 쉽게</p>
              <h2 className="text-5xl font-black leading-tight mb-4 tracking-tight">
                한 손으로도<br /><span className="text-blue-300">척척</span>
              </h2>
            </div>
            <div className="h-[400px]"></div>
          </div>

          <div className="px-6 py-32 text-center relative bg-gradient-to-b from-[#e1edf9] to-white mt-10">
            <p className="text-2xl font-bold mb-2">안전한 그립 디자인</p>
            <h2 className="text-5xl font-black leading-tight mb-16 tracking-tight">
              내구성 탄탄<br /><span className="text-blue-600">오래오래</span>
            </h2>

            <div className="rounded-3xl overflow-hidden shadow-xl aspect-[3/4] md:aspect-square">
              <img
                src="https://images.unsplash.com/photo-1504625298404-183ff1c4fba8?auto=format&fit=crop&q=80&w=1200"
                alt="Durability"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* Section 11: Product Gallery / Conclusion */}
        <section className="bg-gray-100 flex flex-col gap-2 relative">
          <img
            src="https://images.unsplash.com/photo-1540206395-68808572332f?auto=format&fit=crop&q=80&w=1200"
            alt="Gallery 1"
            className="w-full aspect-[4/3] object-cover"
          />

          <div className="w-full aspect-[4/3] bg-blue-500 flex items-center justify-center p-10">
            <div className="bg-white/10 w-full h-full rounded-3xl backdrop-blur-sm border border-white/20 shadow-2xl overflow-hidden flex flex-col items-center justify-center">
              <Waves className="w-32 h-32 text-white/50 mb-6" />
              <p className="text-white text-2xl font-black tracking-widest opacity-30">WATER GUN</p>
            </div>
          </div>

          <img
            src="https://images.unsplash.com/photo-1519097787680-32d8ce5a4351?auto=format&fit=crop&q=80&w=1200"
            alt="Gallery 2"
            className="w-full aspect-video object-cover"
          />

          <div className="bg-[#dfd9c9] py-24 px-6 text-center text-[#4a4030]">
            <div className="space-y-4 font-medium text-xl leading-relaxed mb-10">
              <p>더블샷으로 두 줄 발사!</p>
              <p>대용량으로 오래 즐겨요</p>
            </div>
            <p className="text-4xl font-black">여름 물놀이,<br />더 강력하게!</p>
          </div>
        </section>

        {/* Footer / Info */}
        <footer className="bg-white py-20 px-6 border-t border-gray-200 text-sm break-all font-sans">
          <h2 className="text-3xl font-bold mb-10">구매/배송안내</h2>

          <div className="relative rounded-2xl overflow-hidden h-40 mb-12 shadow-md">
            <img
              src="https://images.unsplash.com/photo-1534068590799-09895a7090b8?auto=format&fit=crop&q=80&w=800"
              alt="Customer Center"
              className="w-full h-full object-cover brightness-75"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <p className="font-bold text-lg mb-1 drop-shadow-md">고객센터</p>
              <p className="text-4xl font-black drop-shadow-lg tracking-wider">1234-5678</p>
            </div>
          </div>

          <div className="space-y-10 text-gray-600">
            <div>
              <h3 className="font-bold text-black text-lg mb-3 flex items-center gap-2"><Info className="w-5 h-5"/> 배송 안내</h3>
              <p className="leading-relaxed">결제 후 순차 발송됩니다.<br />배송일, 배송비는 옵션에서 확인</p>
            </div>

            <div>
              <h3 className="font-bold text-black text-lg mb-3 flex items-center gap-2"><Info className="w-5 h-5"/> 교환/반품 안내</h3>
              <p className="leading-relaxed text-xs sm:text-sm">
                단순변심 교환/반품은 상품 수령 후 7일 이내 가능하며, 사용 흔적, 가치 훼손 시 제한될 수 있습니다.<br />
                특가/프로모션 상품은 변심 반품 시 왕복 배송비가 부과될 수 있습니다.<br />
                제품 이상은 사진과 함께 고객센터로 문의 주시면 빠르게 확인해 드립니다.<br />
                단순변심 교환/반품 시 5,000원 배송료가 청구됩니다.
              </p>
            </div>

            <div className="pt-8 mb-10">
              <h3 className="font-bold text-black text-lg mb-3">상품 정보 고시</h3>
              <table className="w-full border-collapse text-xs md:text-sm border-t-2 border-black">
                <tbody>
                  {[
                    ['상품명', '더블샷슈퍼워터건'],
                    ['모델명', '물총'],
                    ['구성', '대용량워터건 1개'],
                    ['색상', '다양한 컬러'],
                    ['사이즈', '상세페이지 참고'],
                    ['제조국', '대한민국'],
                    ['판매원', '판매원 표기'],
                  ].map(([label, value], i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-3 px-2 bg-gray-50 font-medium text-gray-700 w-1/3">{label}</td>
                      <td className="py-3 px-2 text-gray-600 font-medium">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
