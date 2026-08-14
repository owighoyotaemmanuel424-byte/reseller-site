import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "MultiKartX",
  description: "Digital products and reseller services powered by MultiKartX.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="topbar">
            <Link href="/" className="brand">MultiKartX</Link>
            <nav>
              <Link href="/">Store</Link>
              <Link href="/wallet">Wallet</Link>
              <Link href="/orders">Orders</Link>
              <UserButton afterSignOutUrl="/" />
            </nav>
          </header>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
