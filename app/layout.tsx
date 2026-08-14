import type { Metadata } from "next";
import Link from "next/link";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
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
              <SignedOut>
                <SignInButton mode="modal"><button className="btn secondary">Sign in</button></SignInButton>
                <SignUpButton mode="modal"><button className="btn">Sign up</button></SignUpButton>
              </SignedOut>
              <SignedIn>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
            </nav>
          </header>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
