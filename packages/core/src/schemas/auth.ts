import { z } from 'zod';
export const registerSchema=z.object({fullName:z.string().trim().min(2).max(120),email:z.string().email().max(320),phone:z.string().trim().min(7).max(30),password:z.string().min(8).max(128)});
export const loginSchema=z.object({email:z.string().email(),password:z.string().min(1).max(128)});
export const refreshSchema=z.object({refreshToken:z.string().min(20)});
export type RegisterInput=z.infer<typeof registerSchema>;
export type LoginInput=z.infer<typeof loginSchema>;
