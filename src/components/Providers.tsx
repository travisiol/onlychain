"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { ConnectDialog } from "@/components/ConnectDialog";
import { SessionProvider, type SessionValue } from "@/components/session";

export function Providers({ initial, children }: { initial: SessionValue; children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 10_000 } } }));
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider initial={initial}>
          {children}
          <ConnectDialog />
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
