import {NextResponse} from "next/server";import {requireAdmin} from "@/lib/admin";import {sql} from "@/lib/db";
export async function GET(){const u=await requireAdmin();if(!u)return NextResponse.json({error:"Admin access required"},{status:403});const health:any={database:"ok",timestamp:new Date().toISOString()};try{await sql`SELECT 1`;health.database="ok"}catch{health.database="error"}health.environment=process.env.NODE_ENV||"unknown";health.providerConfigured=Boolean(process.env.JEJELAYE_API_TOKEN?.trim());
const meta=await sql`SELECT key,value FROM admin_settings WHERE key IN ('catalogLastSyncAt','catalogLastSyncCount','catalogLastSyncStatus','catalogLastSyncError')`;
const settings:Record<string,string>={};for(const row of meta)settings[String(row.key)]=String(row.value??"");
const catalog=await sql`SELECT COUNT(*)::int AS count,COUNT(*) FILTER (WHERE active=true)::int AS active,MAX(updated_at) AS "updatedAt" FROM products WHERE provider='jejelaye'`;
const lastSyncAt=settings.catalogLastSyncAt||null;
const ageMs=lastSyncAt?Date.now()-new Date(lastSyncAt).getTime():null;
const fresh=ageMs!==null&&ageMs>=0&&ageMs<10*60*1000;
health.catalog={total:Number(catalog[0]?.count||0),active:Number(catalog[0]?.active||0),latestProductUpdate:catalog[0]?.updatedAt||null,lastSyncAt,lastSyncCount:Number(settings.catalogLastSyncCount||0),lastSyncStatus:settings.catalogLastSyncStatus||"never",lastSyncError:settings.catalogLastSyncError||null,state:fresh?"healthy":lastSyncAt?"stale":"never_synced"};
return NextResponse.json({health});}