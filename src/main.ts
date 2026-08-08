import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port =
    Number(process.env.PORT) ||
    configService.get<number>('app.port') ||
    3000;

  const frontendUrl =
    configService.get<string>('app.frontendUrl') ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173';

  // يشيل المسافات الزايدة والسلاش بآخر الرابط، عشان المقارنة تصير موثوقة
  const normalize = (url: string) => url.trim().replace(/\/+$/, '');

  const allowedOrigins = frontendUrl
    .split(',')
    .map((origin) => normalize(origin))
    .filter(Boolean);

  // Debug مؤقت — احذفهم بعد ما تتأكد إنه الحل نجح
  console.log('frontendUrl RAW:', JSON.stringify(frontendUrl));
  console.log('allowedOrigins:', JSON.stringify(allowedOrigins));

  app.setGlobalPrefix('api');

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      // origin ممكن تكون undefined (Postman, curl, server-to-server requests)
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalize(origin);

      console.log('Incoming Origin:', JSON.stringify(origin));
      console.log('Normalized Origin:', JSON.stringify(normalizedOrigin));
      console.log('Match?', allowedOrigins.includes(normalizedOrigin));

      if (allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'ngrok-skip-browser-warning',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port, '0.0.0.0');

  console.log(`API running on port ${port}`);
}

bootstrap();