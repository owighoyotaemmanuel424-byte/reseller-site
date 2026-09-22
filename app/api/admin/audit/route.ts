import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { sql } from "@/lib/db";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const rows = await sql`
    SELECT
      a.id,
      a.action,
      a.target_type AS "targetType",
      a.target_id AS "targetId",
      a.details_json AS details,
      a.ip_address AS "ipAddress",
      a.created_at AS "createdAt",
      u.email AS "adminEmail"
    FROM admin_audit_logs a
    JOIN users u ON u.id = a.admin_user_id
    ORDER BY a.created_at DESC
    LIMIT 500
  `;

  return NextResponse.json(rows);
}
