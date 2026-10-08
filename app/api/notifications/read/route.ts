import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';

const body = z.object({
  notificationId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const input = body.parse(await req.json());

    if (input.notificationId) {
      await sql`
        UPDATE notifications SET is_read = true, updated_at = now()
        WHERE id = ${input.notificationId} AND user_id = ${user.id}
      `;
    } else {
      await sql`
        UPDATE notifications SET is_read = true, updated_at = now()
        WHERE user_id = ${user.id} AND is_read = false
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark notifications' },
      { status: 400 },
    );
  }
}
