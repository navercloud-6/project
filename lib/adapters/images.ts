import sharp from 'sharp';
import { readBody } from './http';
import { ApplicationError } from '@/lib/domain/errors';
export async function safeImage(request: Request) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(
      request.headers.get('content-type') || '',
    )
  )
    throw new ApplicationError(
      'UNSUPPORTED_MEDIA',
      'JPEG·PNG·WebP 사진만 업로드할 수 있습니다.',
    );
  const body = await readBody(request, 2 * 1024 * 1024, {
    missing: '사진이 필요합니다.',
    tooLarge: '사진은 2MB 이하여야 합니다.',
  });
  try {
    const source = sharp(body, {
      limitInputPixels: 20000000,
      animated: false,
    });
    const meta = await source.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format || '') ||
      (meta.pages || 1) > 1
    )
      throw Error();
    return await source
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    throw new ApplicationError(
      'INVALID_INPUT',
      '사진을 읽을 수 없습니다. 손상되지 않은 JPEG·PNG·WebP 파일을 사용해 주세요.',
    );
  }
}
