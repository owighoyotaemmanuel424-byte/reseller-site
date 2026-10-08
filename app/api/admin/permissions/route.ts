import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, audit } from "@/lib/admin";
import { sql } from "@/lib/db";

const PERMISSIONS = [
  "dashboard.view","analytics.view","orders.view","orders.manage",
  "users.view","users.manage","wallets.view","wallets.adjust",
  "catalog.view","catalog.manage","payments.view","payments.manage",
  "provider.view","provider.sync","audit.view","settings.manage",
  "security.manage","system.view"
] as const;

const body = z.object({
  userId: z.string().uuid(),
  permission: z.enum(PERMISSIONS),
  granted: z.boolean()
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const admins = await sql`SELECT id,email,role,created_at "createdAt" FROM users WHERE role='admin' ORDER BY created_at DESC LIMIT 200`;
  const permissions = await sql`SELECT admin_user_id "userId",permission,granted FROM admin_permissions ORDER BY permission`;
  return NextResponse.json({ permissions: PERMISSIONS, admins, grants: permissions });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  try {
    const b = body.parse(await req.json());
    if (b.userId === admin.id && !b.granted) return NextResponse.json({ error: "You cannot revoke your own access" }, { status: 400 });
    const target = await sql`SELECT id,email,role FROM users WHERE id=${b.userId} LIMIT 1`;
    if (!target[0] || target[0].role !== "admin") return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    await sql`INSERT INTO admin_permissions(admin_user_id,permission,granted) VALUES(${b.userId},${b.permission},${b.granted}) ON CONFLICT(admin_user_id,permission) DO UPDATE SET granted=EXCLUDED.granted,updated_at=now()`;
    await audit(admin.id,"admin.permission_updated","admin",b.userId,{permission:b.permission,granted:b.granted});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid request" }, { status: 400 });
  }
}
