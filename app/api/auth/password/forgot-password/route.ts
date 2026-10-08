import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

const body = z.object({
  email: z.string().email().max(320),
});

export async function POST(req: Request) {
  try {
    const input = body.parse(await req.json());
    const email = input.email.toLowerCase().trim();

    const user = await sql`
      SELECT id FROM users WHERE email = ${email} LIMIT 1
    `;

    const token = randomUUID();
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await sql`
      INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
      VALUES(${user[0]?.id || '00000000-0000-0000-0000-000000000000'}, ${tokenHash}, NOW() + INTERVAL '1 hour')
      ON CONFLICT (user_id, token_hash) DO UPDATE SET expires_at = NOW() + INTERVAL '1 hour'
    `;

    if (process.env.NODE_ENV === 'production') {
      console.log(`Password reset requested for ${email}`);
    }

    return NextResponse.json({
      ok: true,
      message: user[0]
        ? 'If that email exists, a reset link has been sent'
        : 'If that email exists, a reset link has been sent',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to process request' },
      { status: 400 },
    );
  }
}
