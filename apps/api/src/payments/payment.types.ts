export type PaymentGateway = 'paystack' | 'flutterwave' | 'monnify';

export interface InitializePaymentResult { reference: string; authorizationUrl: string; accessCode?: string; }
export interface VerifyPaymentResult { reference: string; status: 'success' | 'failed' | 'pending'; amountKobo: number; currency: string; paidAt?: string; metadata?: Record<string, unknown>; }

export interface VirtualAccountResult { accountNumber: string; bankName: string; accountName: string; providerReference?: string; }

export interface PaymentGatewayAdapter {
  initialize(user: { id: string; email: string; fullName: string }, amountKobo: number, reference: string, callbackUrl?: string): Promise<InitializePaymentResult>;
  verify(reference: string): Promise<VerifyPaymentResult>;
  createVirtualAccount?(user: { id: string; email: string; phone: string; fullName: string }): Promise<VirtualAccountResult>;
}
