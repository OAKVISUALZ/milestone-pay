import type { Metadata } from "next";
import "./globals.css";
import { TestnetBanner } from "../components/TestnetBanner";

export const metadata: Metadata = {
  title: "MilestonePay — Trust-Minimized Soroban Escrow",
  description:
    "Agree on deliverables, fund milestones, and release payment on Stellar Soroban.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
        <TestnetBanner />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4">
            <p>
              MilestonePay — Open Source Escrow Built for the Stellar Ecosystem.
              Smart contracts executed on Soroban Testnet.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
