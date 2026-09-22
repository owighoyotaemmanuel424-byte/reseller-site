import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    const raw = req.headers.authorization;
    if (!raw?.startsWith('Bearer ')) throw new UnauthorizedException('Authentication required');
    try { req.user = await this.jwt.verifyAsync(raw.slice(7), { secret: process.env.JWT_SECRET }); return true; }
    catch { throw new UnauthorizedException('Invalid or expired access token'); }
  }
}
