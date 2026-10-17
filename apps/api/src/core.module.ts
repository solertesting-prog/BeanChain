import { Global, Module } from '@nestjs/common';
import { AppConfig } from './config/app-config';
import { PrismaService } from './prisma/prisma.service';
import { AuditService } from './common/audit.service';
import { CryptoService } from './common/crypto.service';
import { MailService } from './mail/mail.service';
import { NotificationsService } from './notifications/notifications.service';
import { BlockchainService } from './blockchain/blockchain.service';
import { StorageService } from './storage/storage.service';

/**
 * Servicios transversales disponibles en toda la aplicación.
 */
@Global()
@Module({
  providers: [
    AppConfig,
    PrismaService,
    AuditService,
    CryptoService,
    MailService,
    NotificationsService,
    BlockchainService,
    StorageService,
  ],
  exports: [
    AppConfig,
    PrismaService,
    AuditService,
    CryptoService,
    MailService,
    NotificationsService,
    BlockchainService,
    StorageService,
  ],
})
export class CoreModule {}
