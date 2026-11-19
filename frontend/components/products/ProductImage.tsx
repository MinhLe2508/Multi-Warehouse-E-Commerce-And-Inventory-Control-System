'use client';

import { useState } from 'react';
import Image, { type ImageProps } from 'next/image';

const PLACEHOLDER = '/product-placeholder.svg';

export function normalizeProductImageUrl(value?: string | null): string | null {
  const source = value?.trim();
  if (!source || /[\\\s]/.test(source)) return null;
  if (/^\/(?!\/)/.test(source)) return source;
  if (!/^https?:\/\//i.test(source)) return null;
  try {
    const url = new URL(source);
    return url.hostname && !url.username && !url.password ? source : null;
  } catch {
    return null;
  }
}

type ProductImageProps = Omit<
  ImageProps,
  'src' | 'loader' | 'onError' | 'unoptimized'
> & { src?: string | null };

function ImageWithFallback({ alt, src, ...props }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const source = failed ? PLACEHOLDER : (src ?? PLACEHOLDER);
  return (
    <Image
      {...props}
      src={source}
      alt={alt}
      unoptimized
      referrerPolicy="no-referrer"
      onError={source === PLACEHOLDER ? undefined : () => setFailed(true)}
    />
  );
}

export default function ProductImage({ src, ...props }: ProductImageProps) {
  const source = normalizeProductImageUrl(src);
  return (
    <ImageWithFallback key={source ?? PLACEHOLDER} src={source} {...props} />
  );
}
