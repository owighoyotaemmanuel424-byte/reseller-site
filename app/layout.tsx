import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/Providers";
import "./globals.css";
export const metadata:Metadata={title:"MultiKartX",description:"Digital services marketplace and reseller platform."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Providers><header className="topbar"><Link href="/" className="brand">MultiKartX</Link><nav><Link href="/">Home</Link><Link href="/data">Data</Link><Link href="/numbers">Numbers</Link><Link href="/logs">Logs</Link><Link href="/boost">Boost</Link><Link href="/wallet">Wallet</Link><Link href="/orders">Orders</Link><Link href="/account">Account</Link><Link href="/sign-in"><button className="btn secondary">Sign in</button></Link></nav></header><main>{children}</main><nav className="mobile-bottom-nav"><Link href="/">Home</Link><Link href="/data">Services</Link><Link href="/orders">Orders</Link><Link href="/wallet">Wallet</Link><Link href="/account">Account</Link></nav></Providers><Analytics/></body></html>}