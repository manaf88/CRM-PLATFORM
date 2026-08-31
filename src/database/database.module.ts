import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AddMembershipRoles1756900000000 } from './migrations/1756900000000-AddMembershipRoles';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('database.host'),
        port: configService.getOrThrow<number>('database.port'),
        username: configService.getOrThrow<string>('database.user'),
        password: configService.getOrThrow<string>('database.password'),
        database: configService.getOrThrow<string>('database.name'),

        autoLoadEntities: true,

        // Migrations are listed explicitly rather than by glob: the build
        // output layout differs from src, and a glob that silently matches
        // nothing in production is the worst possible failure here.
        migrations: [AddMembershipRoles1756900000000],

        // Production has no other way to change the schema — there is no
        // deploy step that runs migrations — so the app applies pending ones
        // at boot. Every migration must therefore be safe to run twice.
        migrationsRun: true,

        // مهم جداً:
        // لا تستخدم synchronize في production.
        synchronize: configService.get<string>('app.nodeEnv') === 'development',

        logging: configService.get<string>('app.nodeEnv') === 'development',
      }),
    }),
  ],
})
export class DatabaseModule {}
