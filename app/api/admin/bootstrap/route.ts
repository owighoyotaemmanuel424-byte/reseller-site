import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, setSession } from "@/lib/auth";
import { sql } from "@/lib/db";

const body = z.object({
  secret: z.string().min(32).max(256),
  email: z.string().email().max(320),
  password: z.string().min(12).max(128),
});

export async function POST(req: Request) {
  const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!bootstrapSecret || bootstrapSecret.length < 32) {
    return NextResponse.json({ error: "Admin bootstrap is not configured" }, { status: 503 });
  }

  let data: z.infer<typeof body>;
  try {
    data = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid bootstrap request" }, { status: 400 });
  }

  if (data.secret !== bootstrapSecret) {
    return NextResponse.json({ error: "Invalid bootstrap secret" }, { status: 403 });
  }

  const email = data.email.toLowerCase();
  const existing = await sql`SELECT id, role FROM users WHERE email = ${email} LIMIT 1`;

  if (existing[0]) {
    if (existing[0].role !== "admin") {
      await sql`UPDATE users SET role = 'admin', password_hash = ${hashPassword(data.password)} WHERE id = ${existing[0].id}`;
    } else {
      return NextResponse.json({ error: "Admin account already exists" }, { status: 409 });
    }
    await sql`INSERT INTO wallets(user_id) VALUES(${existing[0].id}) ON CONFLICT (user_id) DO NOTHING`;
    await setSession(existing[0].id);
    return NextResponse.json({ ok: true, created: false, message: "Existing account promoted to admin" });
  }

  const rows = await sql`INSERT INTO users(email,password_hash,role) VALUES(${email},${hashPassword(data.password)},'admin') RETURNING id`;
  await sql`INSERT INTO wallets(user_id) VALUES(${rows[0].id})`;
  await setSession(rows[0].id);

  return NextResponse.json({ ok: true, created: true });
}
