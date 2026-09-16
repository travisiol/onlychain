/**
 * The viewer's own wallet, tiled across paid media. A screenshot that leaks
 * carries the wallet that took it — the same deterrent as the username the
 * reference stamps on its images. Drawn over the picture, not into it, so a
 * saved file is not stamped; burning it in server-side is the next step.
 */
export function Watermark({ text }: { text: string }) {
  const rows = [0, 1, 2, 3, 4];
  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden="true">
      <div className="absolute -inset-1/2 flex flex-col justify-around" style={{ transform: "rotate(-22deg)" }}>
        {rows.map((r) => (
          <div key={r} className="flex justify-around whitespace-nowrap text-[13px] font-semibold tracking-[0.08em] text-white/45 mix-blend-difference" style={{ paddingLeft: r % 2 ? 80 : 0 }}>
            {[0, 1, 2, 3].map((c) => (
              <span key={c} className="mx-10">
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
