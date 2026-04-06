import { ScanBarcode } from 'lucide-react';

interface Props {
  totalRecovered: number;
}

export default function ReturnScanHeader({ totalRecovered }: Props) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="page-title">
        <ScanBarcode size={24} className="inline mr-2" />
        반품 바코드 회수처리
      </h1>
      <div className="text-sm text-slate-500">
        오늘 회수:{' '}
        <strong className="text-green-600">{totalRecovered}건</strong>
      </div>
    </div>
  );
}
