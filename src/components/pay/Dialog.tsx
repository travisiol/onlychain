"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

/** A centred modal on a dimmed page. Escape and the backdrop close it. */
export function Dialog({ open, onClose, title, children, width = 440 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className="card w-full overflow-hidden rounded-b-none shadow-[var(--shadow-pop)] fade-up sm:rounded-b-[8px]" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[16px] font-bold">{title}</h2>
          <button type="button" className="icon-btn -mr-2" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
