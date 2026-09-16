"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Watermark } from "@/components/posts/Watermark";
import type { MediaRef } from "@/lib/model";

/**
 * A post's files, one at a time, swiped or clicked through — the reference's
 * multi-image post. One file: no controls at all.
 */
export function MediaCarousel({ media, watermark }: { media: MediaRef[]; watermark?: string }) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const many = media.length > 1;

  const go = (i: number) => {
    const next = (i + media.length) % media.length;
    setIndex(next);
    const el = track.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  return (
    <div className="relative" onContextMenu={watermark ? (e) => e.preventDefault() : undefined}>
      <div ref={track} onScroll={onScroll} className={`flex w-full scrollbar-none ${many ? "snap-x snap-mandatory overflow-x-auto" : "overflow-hidden"}`}>
        {media.map((m, i) => (
          <div key={m.url} className="w-full shrink-0 snap-center bg-black/[0.03]">
            {m.kind === "video" ? (
              <video src={m.url} controls playsInline preload="metadata" className="max-h-[720px] w-full bg-black" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" className="max-h-[760px] w-full object-cover" style={{ aspectRatio: m.width && m.height ? `${m.width} / ${m.height}` : "4 / 3" }} loading={i === 0 ? "eager" : "lazy"} draggable={!watermark} />
            )}
          </div>
        ))}
      </div>
      {watermark && <Watermark text={watermark} />}
      {many && (
        <>
          <button type="button" className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-[var(--shadow-card)] hover:bg-white" onClick={() => go(index - 1)} aria-label="Previous">
            <Icon name="back" size={18} />
          </button>
          <button type="button" className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-[var(--shadow-card)] hover:bg-white" onClick={() => go(index + 1)} aria-label="Next">
            <Icon name="chevron" size={18} />
          </button>
          <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
            {index + 1} / {media.length}
          </span>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {media.map((m, i) => (
              <button key={m.url} type="button" onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/60"}`} aria-label={`Go to ${i + 1}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
