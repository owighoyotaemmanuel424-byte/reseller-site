import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({imports:[JwtModule.register({secret:process.env.JWT_SECRET||'development-only-change-me',signOptions:{expiresIn:'15m'}})],controllers:[AuthController],providers:[AuthService],exports:[AuthService]})
export class AuthModule {}
