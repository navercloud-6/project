import type { Place } from '@/lib/domain/catalog';

export function PhotoCredit({ image }: { image: NonNullable<Place['image']> }) {
  return (
    <>
      사진:{' '}
      <a href={image.sourceUrl} target="_blank" rel="noreferrer">
        {image.author}
      </a>
      {' / '}
      <a href={image.licenseUrl} target="_blank" rel="noreferrer">
        {image.license}
      </a>
    </>
  );
}
