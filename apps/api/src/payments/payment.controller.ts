import { Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PaymentService } from './payment.service';
import { AuthGuard } from '../auth/auth.guard';

const fundSchema = z.object({ amount: z.coerce.number().finite().positive(), callbackUrl: z.string().url().optional() });

@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}
  @Post('initialize') @UseGuards(AuthGuard)
  initialize(@Req() req: { user: { sub: string } }, @Headers('x-idempotency-key') key: string | undefined, @Body() body: unknown) {
    if (!key || key.length < 16 || key.length > 128) throw new UnauthorizedException('X-Idempotency-Key is required');
    const input = fundSchema.parse(body);
    return this.payments.initialize(req.user.sub, input.amount, key, input.callbackUrl);
  }
  @Post('paystack/webhook') @HttpCode(200)
  async paystackWebhook(@Headers('x-paystack-signature') signature: string | undefined, @Body() body: unknown) {
    const raw = JSON.stringify(body);
    if (!signature || !this.payments.verifyWebhook(raw, signature)) throw new UnauthorizedException('Invalid webhook signature');
    return { received: true };
  }
}
