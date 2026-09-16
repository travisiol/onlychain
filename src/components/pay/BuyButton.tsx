"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { BuyDialog } from "@/components/pay/BuyDialog";
import { site } from "@/lib/site";

/** "Buy $ONLY" anywhere on the site — opens the in-app purchase. */
export function BuyButton({ className = "btn btn-accent" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Icon name="coin" size={16} /> Buy ${site.token.symbol} with ETH
      </button>
      <BuyDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
