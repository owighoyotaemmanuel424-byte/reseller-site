import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@jejelaye/db';
import { PaystackAdapter } from './paystack.adapter';

@Injectable()
export class PaymentService {
  constructor(private readonly paystack: PaystackAdapter) {}
  async initialize(userId: string, amountNaira: number, idempotencyKey: string, callbackUrl?: string) {
    if (!Number.isFinite(amountNaira) || amountNaira < 100) throw new BadRequestException('Minimum funding amount is ₦100');
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, fullName: true } });
    if (!user) throw new BadRequestException('User not found');
    const reference = `FUND-${user.id}-${idempotencyKey}-${randomUUID().slice(0, 8)}`;
    const result = await this.paystack.initialize(user, Math.round(amountNaira * 100), reference, callbackUrl);
    return { ...result, amount: amountNaira, currency: 'NGN' };
  }
  async verify(reference: string) { return this.paystack.verify(reference); }
  verifyWebhook(rawBody: string, signature: string) {
    const secret = process.env.PAYSTACK_SECRET_KEY ?? '';
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
