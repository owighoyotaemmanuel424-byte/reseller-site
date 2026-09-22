import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma, creditWallet, debitWallet } from '@jejelaye/db';

@Injectable()
export class WalletService {
  async getMainWallet(userId: string) {
    const wallet = await prisma.wallet.findUnique({ where: { userId_type_currency: { userId, type: 'MAIN', currency: 'NGN' } }, select: { id: true, balance: true, lockedBalance: true, currency: true, type: true } });
    if (!wallet) throw new BadRequestException('Wallet not initialized');
    return wallet;
  }
  async fund(userId: string, amount: number, reference: string) {
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Invalid amount');
    return creditWallet(userId, new Prisma.Decimal(amount), reference, 'Wallet funding');
  }
  async debit(userId: string, amount: number, reference: string, description: string) {
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Invalid amount');
    return debitWallet(userId, new Prisma.Decimal(amount), reference, description);
  }
}
