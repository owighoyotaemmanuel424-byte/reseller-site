import { Injectable, BadGatewayException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { InitializePaymentResult, PaymentGatewayAdapter, VerifyPaymentResult } from './payment.types';

@Injectable()
export class PaystackAdapter implements PaymentGatewayAdapter {
  private readonly http: AxiosInstance = axios.create({ baseURL: 'https://api.paystack.co', timeout: 15000, headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? ''}`, 'Content-Type': 'application/json' } });
  async initialize(user: { id: string; email: string; fullName: string }, amountKobo: number, reference: string, callbackUrl?: string): Promise<InitializePaymentResult> {
    try {
      const { data } = await this.http.post('/transaction/initialize', { email: user.email, amount: amountKobo, reference, callback_url: callbackUrl, metadata: { userId: user.id } });
      if (!data.status || !data.data?.authorization_url) throw new Error(data.message ?? 'Payment initialization failed');
      return { reference: data.data.reference, authorizationUrl: data.data.authorization_url, accessCode: data.data.access_code };
    } catch (e) { throw new BadGatewayException(e instanceof Error ? e.message : 'Payment gateway error'); }
  }
  async verify(reference: string): Promise<VerifyPaymentResult> {
    try {
      const { data } = await this.http.get(`/transaction/verify/${encodeURIComponent(reference)}`);
      const d = data.data;
      return { reference: d.reference, status: d.status === 'success' ? 'success' : d.status === 'failed' ? 'failed' : 'pending', amountKobo: Number(d.amount), currency: d.currency, paidAt: d.paid_at, metadata: d.metadata };
    } catch (e) { throw new BadGatewayException(e instanceof Error ? e.message : 'Payment verification failed'); }
  }
}
