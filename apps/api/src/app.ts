import 'reflect-metadata';
import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { addAuthContract } from './auth/contract.js';
import { registerAuthRoutes, type ResetDelivery } from './auth/routes.js';
import { deliverLocalReset } from './auth/reset-delivery.js';
import { createSmtpDelivery } from './auth/smtp-delivery.js';
import type { AppConfig } from './config.js';
import { createDatabase, probeDatabase } from './database/connection.js';
import { DATABASE_PROBE, HealthController } from './health.js';
@Module({})
class AppModule {}
export async function createApp(config: AppConfig, options: { probe?: () => Promise<void>; logger?: false; deliverReset?: ResetDelivery } = {}) {
  const database = createDatabase(config.DATABASE_URL, config.APP_ENV);
  const definition: DynamicModule = { module: AppModule, controllers: [HealthController], providers: [
    { provide: DATABASE_PROBE, useValue: options.probe ?? (() => probeDatabase(database)) },
    { provide: 'DATABASE_LIFECYCLE', useValue: { onApplicationShutdown: () => database.destroy() } },
  ] };
  const app = await NestFactory.create<NestFastifyApplication>(definition, new FastifyAdapter({ bodyLimit: 1048576, trustProxy: config.APP_ENV === 'staging' ? (address: string, hop: number) => address === '127.0.0.1' && hop === 0 : false }), {
    abortOnError: false,
    logger: options.logger === false ? false : ['error', 'warn', 'log'],
  });
  registerAuthRoutes(app.getHttpAdapter().getInstance(), database, options.deliverReset ?? (config.APP_ENV === 'staging' ? createSmtpDelivery(config) : deliverLocalReset), config.APP_ENV === 'staging' ? [config.APP_ORIGIN!] : undefined);
  app.setGlobalPrefix('api/v1');
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('STICH BILL API').setVersion('0.0.0').setDescription('Local development health and owner authentication API.').build());
  addAuthContract(document);
  SwaggerModule.setup('api/docs', app, document);
  return { app, document };
}
