import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';

export function configureApp(app: NestExpressApplication) {
  const config = app.get(AppConfig);
  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
  return config;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = configureApp(app);
  await app.listen(config.port);
  Logger.log(
    `API de BeanChain en ${config.apiUrl} · blockchain: ${config.blockchain.mode} · KYC: ${config.kyc.provider}`,
    'Bootstrap',
  );
}

if (require.main === module) {
  void bootstrap();
}
