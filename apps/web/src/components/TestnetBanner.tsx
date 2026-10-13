import React from "react";
import { AlertTriangle } from "lucide-react";

export function TestnetBanner() {
  return (
    <div
      role="banner"
      className="bg-amber-500 text-amber-950 px-4 py-2 text-xs md:text-sm font-semibold flex items-center justify-center gap-2 border-b border-amber-600 shadow-sm"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-950" aria-hidden="true" />
      <span>
        <strong>Stellar Testnet Environment:</strong> All escrow contracts and transactions run on the Stellar Testnet. Never send real assets or mainnet keys.
      </span>
    </div>
  );
}
