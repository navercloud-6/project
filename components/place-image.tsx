'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import type { Place } from '@/lib/domain/catalog';

export function PlaceImage({
  image,
  sizes,
  loading = 'lazy',
  alt,
  fallback,
}: {
  image: Place['image'];
  sizes: string;
  loading?: 'lazy' | 'eager';
  alt?: string;
  fallback: ReactNode;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  if (!image || failedSource === image.path) return fallback;

  return (
    <Image
      src={image.path}
      alt={alt ?? image.alt}
      fill
      sizes={sizes}
      loading={loading}
      onError={() => setFailedSource(image.path)}
    />
  );
}
