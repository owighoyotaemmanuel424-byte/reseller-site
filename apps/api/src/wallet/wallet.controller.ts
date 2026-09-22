import { Body, Controller, Get, Headers, Req, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { WalletService } from './wallet.service';
import { AuthGuard } from '../auth/auth.guard';

const fundSchema = z.object({ amount: z.coerce.number().positive().finite() });

@Controller('wallet')
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}
  @Get() get(@Req() req: { user: { sub: string } }) { return this.wallet.getMainWallet(req.user.sub); }
  @Post('fund') fund(@Req() req: { user: { sub: string } }, @Body() body: unknown, @Headers('x-idempotency-key') key?: string) {
    if (!key || key.length < 16 || key.length > 128) throw new Error('X-Idempotency-Key is required');
    const input = fundSchema.parse(body);
    return this.wallet.fund(req.user.sub, input.amount, `fund:${key}`);
  }
}
