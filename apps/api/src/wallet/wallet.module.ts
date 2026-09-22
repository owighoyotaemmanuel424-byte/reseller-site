import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { AuthGuard } from '../auth/auth.guard';

@Module({ imports: [JwtModule.register({})], controllers: [WalletController], providers: [WalletService, AuthGuard] })
export class WalletModule {}
