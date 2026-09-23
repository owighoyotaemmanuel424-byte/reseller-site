import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaystackAdapter } from './paystack.adapter';
import { AuthGuard } from '../auth/auth.guard';

@Module({ imports: [JwtModule.register({})], controllers: [PaymentController], providers: [PaymentService, PaystackAdapter, AuthGuard], exports: [PaymentService] })
export class PaymentModule {}
