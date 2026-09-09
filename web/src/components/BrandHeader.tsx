import type { ReactNode } from 'react';

export function BrandHeader({ title, description }: { title: string; description: ReactNode }) {
  return <><div className="brand-mark" aria-hidden="true">✦</div><h1>{title}</h1><p className="tagline">{description}</p></>;
}
