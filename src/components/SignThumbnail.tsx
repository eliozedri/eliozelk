"use client";

import Image from "next/image";
import { useState } from "react";

interface Props {
  src: string | null;
  alt?: string;
}

export function SignThumbnail({ src, alt = "תמרור" }: Props) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className="w-12 h-12 mx-auto rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-300 text-xs">
        —
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <Image
        src={src}
        alt={alt}
        width={48}
        height={48}
        className="rounded object-contain"
        onError={() => setErrored(true)}
        unoptimized
      />
    </div>
  );
}
