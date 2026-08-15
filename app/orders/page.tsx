"use client";

import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

type OrderRow = { _id: string; productName: string; qty: number; totalKobo: number; status: string };
const money = (kobo:number)=>`₦${(kobo/100).toLocaleString("en-NG",{minimumFractionDigits:2})}`;
export default function OrdersPage(){const {isAuthenticated}=useConvexAuth();const orders=(useQuery(api.orders.list)??[]) as OrderRow[];const report=useMutation(api.orders.report);const [message,setMessage]=useState("");async function doReport(id:string){try{await report({orderId:id as never,reason:"Customer reported an issue"});setMessage("Order reported for review.")}catch(e){setMessage(e instanceof Error?e.message:"Unable")}}if(!isAuthenticated)return <div className="card"><h1>Orders</h1><p>Sign in to see your orders.</p><Link href="/sign-in"><button className="btn">Sign in</button></Link></div>;return <><h1>My Orders</h1>{message&&<div>{message}</div>}<div className="card">{orders.map(o=><div key={o._id}>{o.productName} {money(o.totalKobo)} {o.status}{o.status==="completed"&&<button onClick={()=>doReport(o._id)}>Report</button>}</div>)}</div></>}
