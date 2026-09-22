import { NextResponse } from "next/server";
import { z } from "zod";
import { setSession, verifyPassword, clearSession } from "@/lib/auth";
import { sql } from "@/lib/db";

const body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  try {
    const data = body.parse(await req.json());
    const rows = await sql`
      SELECT id, email, role, password_hash
      FROM users
      WHERE email = ${data.email.toLowerCase()}
      LIMIT 1
    `;
    const user = rows[0];

    if (!user || !verifyPassword(data.password, user.password_hash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await setSession(user.id);
    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
