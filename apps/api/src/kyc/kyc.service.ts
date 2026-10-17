import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KycStatus, KycVerification, Prisma } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletsService } from '../wallets/wallets.service';
import { KYC_PROVIDERS, KycProvider } from './kyc-provider';

export interface MockKycSubmission {
  nationality: string;
  dateOfBirth: string;
  isPep: boolean;
  sourceOfFunds: string;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly providers: Map<string, KycProvider>;

  constructor(
    @Inject(KYC_PROVIDERS) providers: KycProvider[],
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly wallets: WalletsService,
  ) {
    this.providers = new Map(providers.map((p) => [p.name, p]));
  }

  private get provider(): KycProvider {
    const p = this.providers.get(this.config.kyc.provider);
    if (!p) throw new Error(`Proveedor de KYC desconocido: ${this.config.kyc.provider}`);
    return p;
  }

  latest(userId: string) {
    return this.prisma.kycVerification.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async status(userId: string) {
    const v = await this.latest(userId);
    return {
      status: (v?.status ?? 'NOT_STARTED') as KycStatus,
      provider: v?.provider ?? this.config.kyc.provider,
      approvedAt: v?.approvedAt ?? null,
      expiresAt: v?.expiresAt ?? null,
      rejectReason: v?.rejectReason ?? null,
    };
  }

  /** ¿Puede invertir? KYC aprobado y vigente. */
  async isApproved(userId: string): Promise<boolean> {
    const v = await this.latest(userId);
    return !!v && v.status === 'APPROVED' && (!v.expiresAt || v.expiresAt > new Date());
  }

  async start(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.emailVerifiedAt && this.config.isProduction) {
      throw new ForbiddenException('Confirma tu correo antes de verificar tu identidad');
    }
    if (await this.isApproved(userId)) return { status: 'APPROVED' as const };

    const current = await this.latest(userId);
    const session = await this.provider.createSession(user);

    if (!current || current.status === 'REJECTED' || current.status === 'EXPIRED' || current.provider !== this.provider.name) {
      await this.prisma.kycVerification.create({
        data: {
          userId,
          provider: this.provider.name,
          externalId: session.externalId,
          status: this.provider.name === 'mock' ? 'NOT_STARTED' : 'PENDING',
        },
      });
    }
    await this.audit.log({ actorId: userId, action: 'kyc.start', entity: 'User', entityId: userId });
    return { status: 'STARTED' as const, provider: this.provider.name, ...session };
  }

  async submitMock(userId: string, data: MockKycSubmission) {
    if (this.config.kyc.provider !== 'mock') throw new BadRequestException('El envío manual sólo está disponible con el proveedor de pruebas');
    const v = await this.latest(userId);
    if (!v || v.provider !== 'mock') throw new BadRequestException('Inicia primero la verificación');
    if (v.status === 'APPROVED') return this.status(userId);
    await this.prisma.kycVerification.update({
      where: { id: v.id },
      data: { status: 'PENDING', pepHit: data.isPep, rawPayload: data as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log({ actorId: userId, action: 'kyc.submit', entity: 'KycVerification', entityId: v.id });
    return this.status(userId);
  }

  async handleWebhook(providerName: string, headers: Record<string, string | string[] | undefined>, rawBody: Buffer) {
    const provider = this.providers.get(providerName);
    if (!provider) throw new NotFoundException('Proveedor desconocido');
    if (provider.name === 'mock' && this.config.isProduction) throw new ForbiddenException();

    const event = provider.parseWebhook(headers, rawBody);
    if (event.decision === 'ignored') return { ok: true };

    let verification = event.externalId
      ? await this.prisma.kycVerification.findUnique({
          where: { provider_externalId: { provider: provider.name, externalId: event.externalId } },
        })
      : null;
    if (!verification && event.externalUserId) {
      verification = await this.prisma.kycVerification.findFirst({
        where: { userId: event.externalUserId, provider: provider.name },
        orderBy: { createdAt: 'desc' },
      });
      if (verification && !verification.externalId && event.externalId) {
        verification = await this.prisma.kycVerification.update({
          where: { id: verification.id },
          data: { externalId: event.externalId },
        });
      }
    }
    if (!verification) {
      this.logger.warn(`Webhook KYC sin verificación asociada (${provider.name} ${event.externalId})`);
      return { ok: true };
    }

    await this.prisma.kycVerification.update({
      where: { id: verification.id },
      data: {
        rawPayload: event.raw as Prisma.InputJsonValue,
        sanctionsHit: event.sanctionsHit ?? verification.sanctionsHit,
        pepHit: event.pepHit ?? verification.pepHit,
        ...(event.decision === 'pending' ? { status: 'PENDING' } : {}),
      },
    });

    if (event.decision === 'approved' || event.decision === 'rejected') {
      await this.applyDecision(verification, event.decision === 'approved', event.rejectReason ?? null, null);
    }
    return { ok: true };
  }

  async adminList(status?: KycStatus) {
    return this.prisma.kycVerification.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, country: true } } },
    });
  }

  async adminReview(actorId: string, id: string, approve: boolean, reason: string | null) {
    const v = await this.prisma.kycVerification.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Verificación no encontrada');
    if (!approve && !reason) throw new BadRequestException('Indica el motivo del rechazo');
    return this.applyDecision(v, approve, reason, actorId);
  }

  private async applyDecision(v: KycVerification, approve: boolean, reason: string | null, actorId: string | null) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: v.userId } });

    if (approve && this.config.compliance.globalBlockedCountries.includes(user.country)) {
      approve = false;
      reason = 'País de residencia no admitido';
    }
    if (approve && v.sanctionsHit) {
      approve = false;
      reason = 'Coincidencia en listas de sanciones';
    }

    const now = new Date();
    const expiresAt = approve ? new Date(now.getTime() + this.config.compliance.kycValidityDays * 86_400_000) : null;
    const updated = await this.prisma.kycVerification.update({
      where: { id: v.id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approvedAt: approve ? now : null,
        expiresAt,
        rejectReason: approve ? null : reason,
        reviewedById: actorId,
      },
    });

    if (approve) {
      await this.wallets.registerOnChain(user.id, user.country, expiresAt, v.id);
    }

    await this.audit.log({
      actorId,
      action: approve ? 'kyc.approved' : 'kyc.rejected',
      entity: 'KycVerification',
      entityId: v.id,
      data: { userId: user.id, reason },
    });
    await this.notifications.create({
      userId: user.id,
      type: approve ? 'KYC_APPROVED' : 'KYC_REJECTED',
      title: approve ? 'Identidad verificada' : 'No hemos podido verificar tu identidad',
      body: approve
        ? 'Ya puedes invertir en las cosechas disponibles.'
        : `Motivo: ${reason ?? 'sin especificar'}. Puedes volver a intentarlo.`,
      link: approve ? '/oportunidades' : '/perfil/verificacion',
    });
    return updated;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async expireVerifications() {
    const res = await this.prisma.kycVerification.updateMany({
      where: { status: 'APPROVED', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    if (res.count > 0) this.logger.log(`${res.count} verificaciones KYC caducadas`);
  }
}
