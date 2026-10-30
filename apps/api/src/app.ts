import 'reflect-metadata';
import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { AppConfig } from './config.js';
import { createDatabase, probeDatabase } from './database/connection.js';
import { DATABASE_PROBE, HealthController } from './health.js';
@Module({})
class AppModule {}
export async function createApp(config: AppConfig, options: { probe?: () => Promise<void>; logger?: false } = {}) {
  const database = createDatabase(config.DATABASE_URL);
  const definition: DynamicModule = { module: AppModule, controllers: [HealthController], providers: [
    { provide: DATABASE_PROBE, useValue: options.probe ?? (() => probeDatabase(database)) },
    { provide: 'DATABASE_LIFECYCLE', useValue: { onApplicationShutdown: () => database.destroy() } },
  ] };
  const app = await NestFactory.create<NestFastifyApplication>(definition, new FastifyAdapter({ bodyLimit: 1048576 }), {
    abortOnError: false,
    logger: options.logger === false ? false : ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api/v1');
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('STICH BILL API').setVersion('0.0.0').setDescription('Task 002 development health API; no business endpoints.').build());
  SwaggerModule.setup('api/docs', app, document);
  return { app, document };
}
