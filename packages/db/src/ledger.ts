import { Prisma, WalletType, Direction } from '@prisma/client';
import { prisma } from './client';

export async function lockWallet(tx: Prisma.TransactionClient, walletId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; balance: Prisma.Decimal; lockedBalance: Prisma.Decimal }>>(Prisma.sql`SELECT id, balance, "lockedBalance" FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`);
  const wallet = rows[0];
  if (!wallet) throw new Error('WALLET_NOT_FOUND');
  return wallet;
}

export async function creditWallet(userId: string, amount: Prisma.Decimal | number, reference: string, description: string, metadata?: Prisma.InputJsonValue) {
  if (new Prisma.Decimal(amount).lte(0)) throw new Error('AMOUNT_MUST_BE_POSITIVE');
  return prisma.$transaction(async tx => {
    const wallet = await tx.wallet.findUnique({ where: { userId_type_currency: { userId, type: WalletType.MAIN, currency: 'NGN' } } });
    if (!wallet) throw new Error('WALLET_NOT_FOUND');
    const locked = await lockWallet(tx, wallet.id);
    const next = new Prisma.Decimal(locked.balance).plus(amount);
    const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: next } });
    const entry = await tx.ledgerEntry.create({ data: { walletId: wallet.id, direction: Direction.CREDIT, amount: new Prisma.Decimal(amount), balanceAfter: next, reference, description, metadata } });
    return { wallet: updated, entry };
  });
}

export async function debitWallet(userId: string, amount: Prisma.Decimal | number, reference: string, description: string, metadata?: Prisma.InputJsonValue) {
  if (new Prisma.Decimal(amount).lte(0)) throw new Error('AMOUNT_MUST_BE_POSITIVE');
  return prisma.$transaction(async tx => {
    const wallet = await tx.wallet.findUnique({ where: { userId_type_currency: { userId, type: WalletType.MAIN, currency: 'NGN' } } });
    if (!wallet) throw new Error('WALLET_NOT_FOUND');
    const locked = await lockWallet(tx, wallet.id);
    const current = new Prisma.Decimal(locked.balance);
    const debit = new Prisma.Decimal(amount);
    if (current.lt(debit)) throw new Error('INSUFFICIENT_BALANCE');
    const next = current.minus(debit);
    const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: next } });
    const entry = await tx.ledgerEntry.create({ data: { walletId: wallet.id, direction: Direction.DEBIT, amount: debit, balanceAfter: next, reference, description, metadata } });
    return { wallet: updated, entry };
  });
}
