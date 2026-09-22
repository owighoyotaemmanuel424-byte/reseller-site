import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@jejelaye/db';

@Injectable()
export class AuthService {
  constructor(private readonly jwt:JwtService){}
  private async tokens(userId:string,email:string,role:string){
    const accessToken=await this.jwt.signAsync({sub:userId,email,role},{expiresIn:'15m'});
    const refreshToken=randomBytes(48).toString('base64url');
    const hash=createHash('sha256').update(refreshToken).digest('hex');
    await prisma.refreshToken.create({data:{userId,tokenHash:hash,expiresAt:new Date(Date.now()+7*24*60*60*1000)}});
    return {accessToken,refreshToken};
  }
  async register(input:{fullName:string;email:string;phone:string;password:string}){
    const email=input.email.toLowerCase();
    const existing=await prisma.user.findFirst({where:{OR:[{email},{phone:input.phone}]}});
    if(existing)throw new ConflictException('Email or phone already registered');
    const passwordHash=await bcrypt.hash(input.password,12);
    const user=await prisma.user.create({data:{fullName:input.fullName,email,phone:input.phone,passwordHash,wallets:{create:{type:'MAIN',currency:'NGN'}}},select:{id:true,email:true,phone:true,fullName:true,role:true}});
    return {user,...await this.tokens(user.id,user.email,user.role)};
  }
  async login(input:{email:string;password:string}){
    const user=await prisma.user.findUnique({where:{email:input.email.toLowerCase()}});
    if(!user||!(await bcrypt.compare(input.password,user.passwordHash)))throw new UnauthorizedException('Invalid credentials');
    if(user.status!=='ACTIVE')throw new UnauthorizedException('Account is not active');
    return {user:{id:user.id,email:user.email,phone:user.phone,fullName:user.fullName,role:user.role},...await this.tokens(user.id,user.email,user.role)};
  }
  async refresh(refreshToken:string){
    const hash=createHash('sha256').update(refreshToken).digest('hex');
    const record=await prisma.refreshToken.findUnique({where:{tokenHash:hash},include:{user:true}});
    if(!record||record.revokedAt||record.expiresAt<=new Date())throw new UnauthorizedException('Invalid refresh token');
    await prisma.refreshToken.update({where:{id:record.id},data:{revokedAt:new Date()}});
    return this.tokens(record.user.id,record.user.email,record.user.role);
  }
}
