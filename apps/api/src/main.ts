import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap(){
  const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter({logger:true}));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.enableCors({origin:(process.env.CORS_ORIGINS||'http://localhost:3000').split(',').map(v=>v.trim()),credentials:true});
  await app.listen(Number(process.env.PORT||4000),'0.0.0.0');
}
bootstrap();
