/**
 * 이미지 파일을 다운스케일/압축한 data URL로 변환.
 *
 * KC 인증 이미지는 registrationInput JSON(base64)으로 저장되므로 원본을 그대로
 * 넣으면 페이로드가 커진다. 최대 변(maxDimension) 기준으로 줄이고 JPEG로
 * 재인코딩해 용량을 낮춘다. 변환 실패 시 원본 data URL을 그대로 돌려준다.
 */
export async function fileToCompressedDataUrl(
  file: File,
  options: { maxDimension?: number; quality?: number } = {},
): Promise<string> {
  const { maxDimension = 1280, quality = 0.75 } = options;
  const originalDataUrl = await readFileAsDataUrl(file);

  try {
    const image = await loadImage(originalDataUrl);
    const largestSide = Math.max(image.width, image.height);
    const scale = largestSide > maxDimension ? maxDimension / largestSide : 1;
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return originalDataUrl;
    // KC 인증서가 투명 배경(PNG)일 수 있어 JPEG 변환 전 흰 배경을 깔아준다.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const compressed = canvas.toDataURL('image/jpeg', quality);
    // 압축 결과가 더 크면(작은 이미지) 원본을 사용.
    return compressed.length < originalDataUrl.length ? compressed : originalDataUrl;
  } catch {
    return originalDataUrl;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    image.src = src;
  });
}
