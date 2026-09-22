import { z } from 'zod';
export const purchaseSchema=z.object({serviceId:z.string().min(1),customerRef:z.string().trim().min(3).max(120),amount:z.coerce.number().positive().finite(),payload:z.record(z.unknown()).default({})});
export const idempotencyKeySchema=z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/);
export type PurchaseInput=z.infer<typeof purchaseSchema>;
