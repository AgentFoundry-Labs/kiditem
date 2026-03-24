'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  Globe,
  Image as ImageIcon,
  Link as LinkIcon,
  Sparkles,
  Upload,
  X,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';

const PRODUCT_CATEGORIES = [
  {
    main: '계절용품/시즌용품',
    sub: [
      '신학기용품',
      '어린이날',
      '어버이날/스승의날',
      '여름용품',
      '가을운동회',
      '할로윈데이',
      '겨울용품',
      '크리스마스용품',
      '명절용품/설날/추석',
    ],
  },
  {
    main: '문구용품/노트/문구세트/색종이',
    sub: [
      '노트/공책/수첩/스케치북',
      '문구세트',
      '크레파스/물감',
      '색종이/색도화지',
      '화이트보드/메모보드',
      '팬시스티커',
      '지우개',
      '자류/가위/칼',
      '연필깎이',
      '풀/본드/접착제',
      '필기류',
      '필통',
      '기타사무용품',
    ],
  },
  {
    main: '완구/블록/퍼즐/보드/젤리괴물',
    sub: [
      '완구',
      '비눗방울',
      '블록',
      '퍼즐',
      '종이퍼즐',
      '보드게임',
      '라켓/캐치볼',
      '주물럭/젤리괴물/슬라임',
      '큐브/팽이',
      '칼라링/슬링키',
      '탱탱볼/요요볼',
      '기타활동완구',
    ],
  },
  {
    main: '보조가방/책가방/가방류',
    sub: ['보조가방', '크로스백', '비치가방'],
  },
  {
    main: '음악용품/미술용품/체육용품',
    sub: [
      '악기류',
      '미술용품',
      '색종이/색상지/도화지/마분지',
      '배드민턴/라켓류',
      '캐치볼/프로펠라/원반류',
    ],
  },
  {
    main: '학습교재/수업교재',
    sub: [
      '수업교재(종이)',
      '수업교재(나무)',
      '수업교재(기타)',
      '컬러룬(풍선)색칠하기',
      '색칠놀이(기타)',
      '역할놀이',
      '비즈/생크림공예',
      '십자수/뜨개질',
      '점토/클레이',
      '학습교구',
    ],
  },
  {
    main: '팬시/앨범/지갑/거울/악세서리',
    sub: [
      '팬시',
      '다용도꽂이/정리함',
      '앨범/액자',
      '지갑/동전지갑',
      '악세서리/반지/목걸이',
      '포장지류/선물상자',
      '시계',
      '저금통',
      '컵/텀블러/물병',
      '우산/우비',
    ],
  },
  {
    main: '만들기재료/클레이/비즈',
    sub: [
      '리본/비드/줄/끈',
      '폼폼이/모루',
      '고무재료',
      '나무재료',
      '종이재료',
      '천재료',
      '플라스틱재료',
      '쇠/핀재료',
      '찍찍이/벨크로',
      '스티로폼재료',
      '기타만들기재료',
    ],
  },
  {
    main: '유치원용품/티셔츠/시설교구용품/도시락',
    sub: [
      '원아수첩/명찰/기타',
      '앞치마/토시/덧신',
      '도시락/간식접시/물병',
      '역할놀이교구/손인형',
      '시설교구',
      '단체티셔츠/모자',
      '상장류',
      '공부상',
    ],
  },
  {
    main: '커피류/시리얼/간식류/사탕류',
    sub: ['시리얼', '과자류', '사탕류', '음료(차)'],
  },
];

export default function GeneratePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'url' | 'image'>('url');
  const [url, setUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const isFormValid = mode === 'url' ? url.trim() !== '' : images.length > 0;

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { category: category || null };
      if (mode === 'url' && url) {
        body.url = url;
      } else if (mode === 'image' && images.length > 0) {
        body.imageBase64s = images;
      }

      const res = await fetch(`${API_BASE}/api/content/analyze-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`AI 분석 실패 (${res.status}): ${text}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '상세페이지 생성 중 오류가 발생했습니다.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (result) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => setResult(null)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-bold transition-colors"
          >
            <ArrowLeft size={20} />
            다시 만들기
          </button>
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
            <Sparkles size={16} />
            AI GENERATED
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle2 className="text-emerald-500" size={24} />
              <h2 className="text-xl font-bold text-gray-900">
                AI 분석 완료!
              </h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              AI 분석 결과가 생성되었습니다. 상세 편집은 수집상품 페이지에서 확인하세요.
            </p>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-700 overflow-auto max-h-[400px]">
              {JSON.stringify(result, null, 2)}
            </pre>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => router.push('/sourcing')}
                className="px-6 py-2.5 bg-emerald-500 text-white rounded-lg font-bold text-sm hover:bg-emerald-600 transition-colors"
              >
                수집상품 목록으로
              </button>
              <button
                onClick={() => {
                  setResult(null);
                  setUrl('');
                  setImages([]);
                }}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                새로 만들기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto">
      <div className="bg-white border-b border-gray-200 px-8 py-10">
        <div className="max-w-4xl mx-auto flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Sparkles className="text-blue-600" size={24} />
              </div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                AI 상세페이지 생성
              </h1>
            </div>
            <p className="text-gray-500 text-lg max-w-2xl leading-relaxed">
              상품 URL이나 이미지를 등록하시면, AI가 외국어를 완벽히 번역하고
              타겟 고객에 맞춘 프리미엄 마케팅 문구를 자동으로 작성합니다.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-4xl mx-auto w-full px-8 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 max-w-4xl mx-auto w-full p-8 space-y-8">
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold">
              1
            </div>
            <h2 className="text-xl font-bold text-gray-800">
              상품 정보 입력 방식 선택
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <button
              onClick={() => setMode('url')}
              className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${
                mode === 'url'
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50 text-gray-400'
              }`}
            >
              <Globe
                size={32}
                className={mode === 'url' ? 'text-gray-900' : ''}
              />
              <div
                className={
                  mode === 'url' ? 'text-gray-900' : 'text-gray-500'
                }
              >
                <p className="font-bold text-lg mb-1">쇼핑몰 URL 연동</p>
                <p className="text-sm opacity-80">
                  쿠팡, 스마트스토어 등 링크 복사/붙여넣기
                </p>
              </div>
            </button>
            <button
              onClick={() => setMode('image')}
              className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${
                mode === 'image'
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50 text-gray-400'
              }`}
            >
              <ImageIcon
                size={32}
                className={mode === 'image' ? 'text-gray-900' : ''}
              />
              <div
                className={
                  mode === 'image' ? 'text-gray-900' : 'text-gray-500'
                }
              >
                <p className="font-bold text-lg mb-1">직접 이미지 업로드</p>
                <p className="text-sm opacity-80">
                  PC에 저장된 상품 이미지 파일 선택
                </p>
              </div>
            </button>
          </div>

          {mode === 'url' ? (
            <div className="space-y-3">
              <label className="block text-sm font-bold text-gray-700">
                추출할 상품 URL
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <LinkIcon className="text-gray-400" size={20} />
                </div>
                <input
                  type="url"
                  placeholder="https://taobao.com/product/123, https://coupang.com/vp/products/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-gray-900 focus:ring-0 focus:outline-none transition-colors text-lg"
                />
              </div>
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-500" />
                자동으로 상품의 메인 이미지 5장을 수집하여 분석합니다.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-bold text-gray-700">
                상품 이미지 (권장 3~5장)
              </label>
              <div className="grid grid-cols-4 gap-4">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 group bg-gray-100"
                  >
                    <img
                      src={img}
                      alt={`Preview ${idx}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}

                <div className="relative aspect-square border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center hover:border-gray-900 hover:bg-gray-50 transition-all cursor-pointer group">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <Upload
                    className="text-gray-400 group-hover:text-gray-900 mb-2 transition-colors"
                    size={28}
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-900 font-medium transition-colors">
                    이미지 추가
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold">
              2
            </div>
            <h2 className="text-xl font-bold text-gray-800">
              추가 설정 (선택 사항)
            </h2>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-700">
              상품 카테고리
            </label>
            <p className="text-sm text-gray-500 mb-2">
              카테고리를 지정하면 해당 분야에 최적화된 마케팅 용어와 문체가
              적용됩니다.
            </p>
            <div className="relative max-w-md">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-gray-900 focus:outline-none appearance-none transition-colors font-medium text-gray-800"
              >
                <option value="">자동 감지 (권장)</option>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <optgroup key={cat.main} label={cat.main}>
                    {cat.sub.map((sub) => (
                      <option
                        key={sub}
                        value={`${cat.main} > ${sub}`}
                      >
                        {sub}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                size={20}
              />
            </div>
          </div>
        </section>

        <div className="pt-4 pb-12 flex flex-col gap-4 items-center max-w-md mx-auto">
          <button
            onClick={handleSubmit}
            disabled={isLoading || !isFormValid}
            className={`w-full py-5 rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-3 ${
              isLoading
                ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                : !isFormValid
                  ? 'bg-gray-800 text-gray-400 cursor-not-allowed opacity-50'
                  : 'bg-gray-900 text-white hover:bg-gray-800 shadow-xl shadow-gray-200 active:scale-[0.98]'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 size={24} className="animate-spin" />
                AI 분석 및 디자인 중...
              </>
            ) : (
              <>
                <Sparkles
                  size={24}
                  className={isFormValid ? 'text-blue-400' : ''}
                />
                AI 상세페이지 자동 생성
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-blue-600 font-black text-xl mb-3 flex items-center gap-2">
            <Sparkles size={24} />
            AI OCR 텍스트 번역 및 이미지 재생성 중...
          </p>
          <p className="text-gray-500 text-sm">
            중국어 등 외국어를 스캔하여 지우고 한국어로 재생성하고 있습니다.
          </p>
          <p className="text-gray-400 text-sm mt-1">
            이 작업은 약 20~40초가 소요될 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
