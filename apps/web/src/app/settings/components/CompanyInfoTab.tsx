'use client';

import { Building2 } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import type { CompanyInfo } from '../page';

interface CompanyInfoTabProps {
  companyInfo: CompanyInfo | null;
  loading: boolean;
}

export default function CompanyInfoTab({ companyInfo, loading }: CompanyInfoTabProps) {
  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  const fields: { label: string; value: string | null | undefined }[] = [
    { label: '회사명', value: companyInfo?.name },
    { label: '사업자번호', value: companyInfo?.businessNumber },
    { label: '대표자', value: companyInfo?.representative },
    { label: '주소', value: companyInfo?.address },
    { label: '전화번호', value: companyInfo?.phone },
    { label: '이메일', value: companyInfo?.email },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Building2 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">회사 정보</h2>
            <p className="text-sm text-gray-500">등록된 회사 기본 정보입니다.</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        {!companyInfo ? (
          <div className="text-center py-8 text-gray-500">
            <Building2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">등록된 회사 정보가 없습니다.</p>
            <p className="text-xs text-gray-400 mt-1">
              백엔드 API에서 회사 정보를 등록해주세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((field) => (
              <div key={field.label}>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  {field.label}
                </label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900">
                  {field.value || '-'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
