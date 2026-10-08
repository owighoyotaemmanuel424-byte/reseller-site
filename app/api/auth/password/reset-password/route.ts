import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { createHash, randomUUID } from 'node:crypto';

const body = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  try {
    const input = body.parse(await req.json());
    const tokenHash = createHash('sha256').update(input.token).digest('hex');

    const resetRecord = await sql`
      SELECT id, user_id AS "userId", expires_at AS "expiresAt"
      FROM password_reset_tokens
      WHERE token_hash = ${tokenHash}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!resetRecord[0] || new Date(resetRecord[0].expiresAt) <= new Date()) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    const salt = randomUUID().slice(0, 16).replace(/-/g, '');
    const { scryptSync } = await import('node:crypto');
    const passwordHash = salt + '$' + scryptSync(input.password, salt, 64).toString('hex');

    await sql`
      UPDATE users SET password_hash = ${passwordHash}, updated_at = now()
      WHERE id = ${resetRecord[0].userId}
    `;

    await sql`
      UPDATE refresh_tokens SET revoked_at = now()
      WHERE user_id = ${resetRecord[0].userId}
    `;

    await sql`
      DELETE FROM password_reset_tokens WHERE id = ${resetRecord[0].id}
    `;

    return NextResponse.json({
      ok: true,
      message: 'Password has been reset. Please sign in with your new password.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to reset password' },
      { status: 400 },
    );
  }
}
