import crypto from "node:crypto";
import {sql} from "@/lib/db";
export type ProviderName="jejelaye"|"paystack"|"flutterwave"|"monnify"|"resend"|"termii";
const P:any={jejelaye:{name:"JejeLaye",baseUrl:"https://jejelayegct.com.ng/api/v1",secrets:["apiToken"]},paystack:{name:"Paystack",baseUrl:"https://api.paystack.co",secrets:["secretKey"]},flutterwave:{name:"Flutterwave",baseUrl:"https://api.flutterwave.com/v3",secrets:["secretKey","encryptionKey"]},monnify:{name:"Monnify",baseUrl:"https://api.monnify.com",secrets:["apiKey","secretKey"]},resend:{name:"Resend",baseUrl:"https://api.resend.com",secrets:["apiKey"]},termii:{name:"Termii",baseUrl:"https://api.ng.termii.com",secrets:["apiKey"]}};
function key(){const k=(process.env.ENCRYPTION_KEY||"").trim();if(!/^[a-f0-9]{64}$/i.test(k))throw Error("ENCRYPTION_KEY must be 64 hexadecimal characters");return Buffer.from(k,"hex")}
function enc(v:string){const iv=crypto.randomBytes(12),c=crypto.createCipheriv("aes-256-gcm",key(),iv),d=Buffer.concat([c.update(v),c.final()]);return "v1:"+iv.toString("base64url")+":"+c.getAuthTag().toString("base64url")+":"+d.toString("base64url")}
function dec(v:string){if(!v.startsWith("v1:"))return v;const p=v.split(":"),d=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(p[1],"base64url"));d.setAuthTag(Buffer.from(p[2],"base64url"));return Buffer.concat([d.update(Buffer.from(p[3],"base64url")),d.final()]).toString()}
function mask(v:string){return v?(v.length<=8?"••••••••":"••••••••"+v.slice(-4)):""}
export function providerDefinitions(){return P}
export async function readProviderConfigs(){const rows=await sql`SELECT * FROM provider_configs ORDER BY provider`;return Object.keys(P).map(provider=>{const d=P[provider],r:any=rows.find((x:any)=>x.provider===provider);let s:any={};try{s=r?.secret_json?JSON.parse(dec(r.secret_json)):{}}catch{};return {provider,name:d.name,enabled:r?.enabled??false,baseUrl:r?.base_url||d.baseUrl,publicKey:r?.public_key||"",secrets:Object.fromEntries(d.secrets.map((k:string)=>[k,mask(s[k]||"")])),configured:d.secrets.every((k:string)=>Boolean(s[k])),updatedAt:r?.updated_at||null}})}
export async function saveProviderConfig(provider:ProviderName,b:any,adminId:string){const d=P[provider];if(!d)throw Error("Unsupported provider");const old:any=(await sql`SELECT secret_json FROM provider_configs WHERE provider=${provider}`)[0];let s:any={};try{s=old?.secret_json?JSON.parse(dec(old.secret_json)):{}}catch{}for(const k of d.secrets)if(typeof b[k]==="string"&&b[k].trim())s[k]=b[k].trim();await sql`INSERT INTO provider_configs(provider,enabled,base_url,public_key,secret_json,updated_by,updated_at) VALUES(${provider},${Boolean(b.enabled)},${String(b.baseUrl||d.baseUrl).trim()},${String(b.publicKey||"").trim()},${enc(JSON.stringify(s))},${adminId},now()) ON CONFLICT(provider) DO UPDATE SET enabled=EXCLUDED.enabled,base_url=EXCLUDED.base_url,public_key=EXCLUDED.public_key,secret_json=EXCLUDED.secret_json,updated_by=EXCLUDED.updated_by,updated_at=now()`}
export async function getProviderRuntimeConfig(provider:ProviderName){
  const d=P[provider];
  if(!d)throw Error("Unsupported provider");
  const row:any=(await sql`SELECT enabled,base_url,public_key,secret_json FROM provider_configs WHERE provider=${provider} LIMIT 1`)[0];
  if(row){
    let secrets:any={};
    try{secrets=row.secret_json?JSON.parse(dec(row.secret_json)):{};}catch{throw Error("Unable to decrypt provider configuration")}
    if(!row.enabled)throw Error(`${d.name} is disabled`);
    return {enabled:true,baseUrl:String(row.base_url||d.baseUrl),publicKey:String(row.public_key||""),secrets};
  }
  const env:any={
    jejelaye:{apiToken:process.env.JEJELAYE_API_TOKEN||""},
    paystack:{secretKey:process.env.PAYSTACK_SECRET_KEY||""},
    flutterwave:{secretKey:process.env.FLUTTERWAVE_SECRET_KEY||"",encryptionKey:process.env.FLUTTERWAVE_ENCRYPTION_KEY||""},
    monnify:{apiKey:process.env.MONNIFY_API_KEY||"",secretKey:process.env.MONNIFY_SECRET_KEY||""},
    resend:{apiKey:process.env.RESEND_API_KEY||""},
    termii:{apiKey:process.env.TERMII_API_KEY||""}
  };
  return {enabled:true,baseUrl:d.baseUrl,publicKey:"",secrets:env[provider]||{}};
}
