import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { PaymentModule } from './payments/payment.module';

@Module({ imports: [JwtModule.register({}), AuthModule, WalletModule, PaymentModule] })
export class AppModule {}
