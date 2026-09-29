import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, setSession } from "@/lib/auth";
import { sql } from "@/lib/db";

const body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  try {
    const data = body.parse(await req.json());
    const email = data.email.trim().toLowerCase();

    const existing = await sql`SELECT id FROM users WHERE email=${email} LIMIT 1`;
    if (existing[0]) {
      return NextResponse.json({ error: "Account already exists" }, { status: 409 });
    }

    const rows = await sql`
      INSERT INTO users(email, password_hash, role)
      VALUES(${email}, ${hashPassword(data.password)}, 'customer')
      RETURNING id, email, role
    `;

    await sql`INSERT INTO wallets(user_id) VALUES(${rows[0].id})`;
    await setSession(rows[0].id);

    return NextResponse.json({
      ok: true,
      user: { id: rows[0].id, email: rows[0].email, role: rows[0].role },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed" },
      { status: 400 },
    );
  }
}
