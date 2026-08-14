import type { Metadata } from "next";
import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
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
              <Show when="signed-out">
                <SignInButton mode="modal"><button className="btn secondary">Sign in</button></SignInButton>
                <SignUpButton mode="modal"><button className="btn">Sign up</button></SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton afterSignOutUrl="/" />
              </Show>
            </nav>
          </header>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
