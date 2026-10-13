import React from "react";
import { ShieldAlert } from "lucide-react";

export function DisputeNotice() {
  return (
    <div
      role="region"
      aria-label="Escrow Dispute Policy"
      className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs md:text-sm text-blue-900 flex items-start gap-3 my-4"
    >
      <ShieldAlert className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <h4 className="font-semibold text-blue-950 mb-1">Escrow Safety &amp; Mutual Settlement Policy</h4>
        <p className="leading-relaxed">
          MilestonePay enforces trust-minimized smart contract custody without unilateral admin backdoors.
          Once funded, funds can only be released with client authorization or refunded with mutual authorization from <strong>both</strong> client and freelancer.
          In the event of an unresolvable dispute, funds remain securely locked in the Soroban contract until mutual agreement is reached.
        </p>
      </div>
    </div>
  );
}
