import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';

@Module({ imports: [JwtModule.register({}), AuthModule, WalletModule] })
export class AppModule {}
