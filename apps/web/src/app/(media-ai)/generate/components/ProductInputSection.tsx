'use client';

import {
  CheckCircle2,
  Globe,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductInputSectionProps {
  mode: 'url' | 'image';
  setMode: (mode: 'url' | 'image') => void;
  url: string;
  setUrl: (url: string) => void;
  images: string[];
  setImages: (images: string[]) => void;
  imagesLoading?: boolean;
}

export default function ProductInputSection({ mode, setMode, url, setUrl, images, setImages, imagesLoading }: ProductInputSectionProps) {
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages([...images, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">
          1
        </div>
        <h2 className="text-xl font-bold text-slate-800">
          상품 정보 입력 방식 선택
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => setMode('url')}
          className={cn('p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3', mode === 'url' ? 'border-slate-900 bg-slate-50' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50 text-slate-400')}
        >
          <Globe
            size={32}
            className={mode === 'url' ? 'text-slate-900' : ''}
          />
          <div
            className={
              mode === 'url' ? 'text-slate-900' : 'text-slate-500'
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
          className={cn('p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3', mode === 'image' ? 'border-slate-900 bg-slate-50' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50 text-slate-400')}
        >
          <ImageIcon
            size={32}
            className={mode === 'image' ? 'text-slate-900' : ''}
          />
          <div
            className={
              mode === 'image' ? 'text-slate-900' : 'text-slate-500'
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
          <label className="block text-sm font-bold text-slate-700">
            추출할 상품 URL
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <LinkIcon className="text-slate-400" size={20} />
            </div>
            <input
              type="url"
              placeholder="https://taobao.com/product/123, https://coupang.com/vp/products/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-slate-900 focus:ring-0 focus:outline-none transition-colors text-lg"
            />
          </div>
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-500" />
            자동으로 상품의 메인 이미지 5장을 수집하여 분석합니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-700">
            상품 이미지 (권장 3~5장)
          </label>
          {imagesLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 size={16} className="animate-spin" />
              허브 이미지를 불러오는 중...
            </div>
          )}
          <div className="grid grid-cols-4 gap-4">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-slate-100"
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

            <div className="relative aspect-square border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center hover:border-slate-900 hover:bg-slate-50 transition-all cursor-pointer group">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <Upload
                className="text-slate-400 group-hover:text-slate-900 mb-2 transition-colors"
                size={28}
              />
              <span className="text-sm text-slate-600 group-hover:text-slate-900 font-medium transition-colors">
                이미지 추가
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
