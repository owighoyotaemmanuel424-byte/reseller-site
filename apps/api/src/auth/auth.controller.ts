import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
const register=z.object({fullName:z.string().trim().min(2).max(120),email:z.string().email(),phone:z.string().trim().min(7).max(30),password:z.string().min(8).max(128)});
const login=z.object({email:z.string().email(),password:z.string().min(1).max(128)});
const refresh=z.object({refreshToken:z.string().min(20)});
@Controller('auth') export class AuthController { constructor(private readonly auth:AuthService){}
@Post('register') registerUser(@Body() body:unknown){return this.auth.register(register.parse(body));}
@Post('login') loginUser(@Body() body:unknown){return this.auth.login(login.parse(body));}
@Post('refresh') refreshToken(@Body() body:unknown){return this.auth.refresh(refresh.parse(body).refreshToken);}
}
