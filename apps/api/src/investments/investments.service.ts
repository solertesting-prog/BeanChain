import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvestmentStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { KycService } from '../kyc/kyc.service';
import { WalletsService } from '../wallets/wallets.service';
import { StripeClient } from '../payments/stripe.client';
import { bpsOf } from '../common/money';
import { CreateInvestmentDto, ListInvestmentsQuery } from './investments.dto';
import { evaluateInvestment } from './investment-rules';

const HELD: InvestmentStatus[] = ['PAID', 'TOKENS_ISSUED'];

function formatEur(cents: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly chain: BlockchainService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly kyc: KycService,
    private readonly wallets: WalletsService,
    private readonly stripe: StripeClient,
  ) {}

  // ---------------------------------------------------------------------
  // Inversor
  // ---------------------------------------------------------------------

  /** Simula la inversión sin reservar nada (para el resumen previo al pago). */
  async quote(userId: string, dto: CreateInvestmentDto) {
    const { result } = await this.evaluate(this.prisma, userId, dto);
    return result;
  }

  async create(userId: string, dto: CreateInvestmentDto, ip: string | null) {
    if (dto.paymentMethod === 'STABLECOIN') {
      throw new BadRequestException('El pago con stablecoin estará disponible próximamente');
    }
    if (dto.paymentMethod === 'CARD' && !this.stripe.enabled) {
      throw new BadRequestException('El pago con tarjeta no está disponible');
    }

    const investment = await this.prisma.$transaction(
      async (tx) => {
        // Bloquea la fila de la oportunidad para que dos reservas simultáneas no sobrevendan.
        await tx.$queryRaw`SELECT id FROM "Opportunity" WHERE id = ${dto.opportunityId} FOR UPDATE`;
        const { result, opportunity } = await this.evaluate(tx, userId, dto);
        if (!result.ok) throw new BadRequestException({ code: result.code, message: result.message });

        return tx.investment.create({
          data: {
            userId,
            opportunityId: opportunity.id,
            tokens: dto.tokens,
            amountCents: result.amountCents,
            feeCents: bpsOf(result.amountCents, opportunity.platformFeeBps),
            paymentMethod: dto.paymentMethod,
            paymentReference: this.newReference(),
            riskAcknowledgedAt: new Date(),
            expiresAt: new Date(Date.now() + this.config.payments.reservationHours * 3_600_000),
          },
          include: { opportunity: { select: { title: true, slug: true } }, user: { select: { email: true } } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 },
    );

    let checkoutUrl: string | undefined;
    if (dto.paymentMethod === 'CARD') {
      const session = await this.stripe.createCheckout({
        investmentId: investment.id,
        reference: investment.paymentReference,
        amountCents: investment.amountCents,
        description: `${investment.tokens} tokens · ${investment.opportunity.title}`,
        customerEmail: investment.user.email,
      });
      checkoutUrl = session.url;
      await this.prisma.payment.create({
        data: {
          investmentId: investment.id,
          provider: 'stripe',
          externalId: session.id,
          amountCents: investment.amountCents,
          checkoutUrl,
        },
      });
    } else {
      await this.mail.sendInvestmentInstructions(investment.user.email, {
        title: investment.opportunity.title,
        amount: formatEur(investment.amountCents),
        reference: investment.paymentReference,
        iban: this.config.payments.iban,
        beneficiary: this.config.payments.beneficiary,
        expiresAt: investment.expiresAt,
      });
    }

    await this.audit.log({
      actorId: userId,
      action: 'investment.create',
      entity: 'Investment',
      entityId: investment.id,
      data: { tokens: investment.tokens, amountCents: investment.amountCents, method: dto.paymentMethod },
      ip,
    });
    await this.notifications.create({
      userId,
      type: 'INVESTMENT_RESERVED',
      title: 'Reserva confirmada',
      body: `Has reservado ${investment.tokens} tokens de ${investment.opportunity.title}. Completa el pago para recibirlos.`,
      link: '/cartera',
    });

    return {
      ...this.toInvestor(investment),
      paymentInstructions:
        dto.paymentMethod === 'BANK_TRANSFER'
          ? {
              method: 'BANK_TRANSFER' as const,
              iban: this.config.payments.iban,
              bic: this.config.payments.bic,
              beneficiary: this.config.payments.beneficiary,
              reference: investment.paymentReference,
              amountCents: investment.amountCents,
              expiresAt: investment.expiresAt,
            }
          : { method: 'CARD' as const, checkoutUrl },
    };
  }

  async listMine(userId: string) {
    const items = await this.prisma.investment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { opportunity: { select: { title: true, slug: true, tokenSymbol: true, status: true } } },
    });
    return items.map((i) => this.toInvestor(i));
  }

  async cancelMine(userId: string, id: string) {
    const inv = await this.prisma.investment.findFirst({ where: { id, userId } });
    if (!inv) throw new NotFoundException('Inversión no encontrada');
    if (inv.status !== 'PENDING_PAYMENT') throw new ConflictException('Sólo se pueden cancelar reservas sin pagar');
    await this.prisma.investment.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    await this.audit.log({ actorId: userId, action: 'investment.cancel', entity: 'Investment', entityId: id });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Pagos y emisión
  // ---------------------------------------------------------------------

  /**
   * Confirma el cobro de una inversión (conciliación bancaria manual o
   * webhook de la pasarela) y emite los tokens. Idempotente.
   */
  async confirmPayment(params: {
    investmentId: string;
    provider: string;
    externalId: string;
    amountCents: number;
    actorId: string | null;
    raw?: unknown;
  }) {
    const inv = await this.prisma.investment.findUnique({ where: { id: params.investmentId } });
    if (!inv) throw new NotFoundException('Inversión no encontrada');
    if (inv.status === 'PAID' || inv.status === 'TOKENS_ISSUED') return this.issueTokens(inv.id);
    if (inv.status !== 'PENDING_PAYMENT') {
      throw new ConflictException(`La inversión está ${inv.status}; revisa el cobro manualmente para devolverlo`);
    }
    if (params.amountCents !== inv.amountCents) {
      throw new BadRequestException(
        `El importe recibido (${formatEur(params.amountCents)}) no coincide con el esperado (${formatEur(inv.amountCents)})`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.payment.upsert({
        where: { provider_externalId: { provider: params.provider, externalId: params.externalId } },
        create: {
          investmentId: inv.id,
          provider: params.provider,
          externalId: params.externalId,
          amountCents: params.amountCents,
          status: 'SUCCEEDED',
          raw: (params.raw ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        update: { status: 'SUCCEEDED', raw: (params.raw ?? undefined) as Prisma.InputJsonValue | undefined },
      }),
      this.prisma.investment.update({ where: { id: inv.id }, data: { status: 'PAID', paidAt: new Date() } }),
    ]);
    await this.audit.log({
      actorId: params.actorId,
      action: 'investment.paid',
      entity: 'Investment',
      entityId: inv.id,
      data: { provider: params.provider, externalId: params.externalId, amountCents: params.amountCents },
    });
    return this.issueTokens(inv.id);
  }

  /** Emite (mint) los tokens de una inversión pagada. Reintentable. */
  async issueTokens(investmentId: string) {
    const inv = await this.prisma.investment.findUniqueOrThrow({
      where: { id: investmentId },
      include: { opportunity: true, user: true },
    });
    if (inv.status === 'TOKENS_ISSUED') return this.toInvestor(inv);
    if (inv.status !== 'PAID') throw new ConflictException('La inversión no está pagada');
    if (!inv.opportunity.tokenAddress) throw new ConflictException('El token de la cosecha no está desplegado');

    let wallet = await this.prisma.wallet.findUnique({ where: { userId: inv.userId } });
    if (!wallet?.onchainRegisteredAt) {
      const kyc = await this.kyc.latest(inv.userId);
      if (!kyc || kyc.status !== 'APPROVED') throw new ForbiddenException('El inversor no tiene el KYC vigente');
      wallet = await this.wallets.registerOnChain(inv.userId, inv.user.country, kyc.expiresAt, kyc.id);
    }

    const txHash = await this.chain.mint(inv.opportunity.tokenAddress, wallet.address, inv.tokens, inv.id);
    const updated = await this.prisma.investment.update({
      where: { id: inv.id },
      data: { status: 'TOKENS_ISSUED', issuedAt: new Date(), mintTxHash: txHash },
      include: { opportunity: { select: { title: true, slug: true, tokenSymbol: true, status: true } } },
    });
    await this.notifications.create({
      userId: inv.userId,
      type: 'TOKENS_ISSUED',
      title: 'Tokens recibidos',
      body: `Hemos recibido tu pago y ya tienes ${inv.tokens} tokens ${inv.opportunity.tokenSymbol} en tu wallet.`,
      link: '/cartera',
    });
    return this.toInvestor(updated);
  }

  async handleStripeWebhook(event: any) {
    if (event?.type !== 'checkout.session.completed') return { ok: true };
    const session = event.data?.object;
    const investmentId = session?.metadata?.investmentId;
    if (!investmentId || session.payment_status !== 'paid') return { ok: true };
    await this.confirmPayment({
      investmentId,
      provider: 'stripe',
      externalId: session.id,
      amountCents: session.amount_total,
      actorId: null,
      raw: { id: event.id, type: event.type },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Administración
  // ---------------------------------------------------------------------

  async adminList(q: ListInvestmentsQuery) {
    const page = q.page ?? 1;
    const where: Prisma.InvestmentWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.investment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          opportunity: { select: { title: true, slug: true, tokenSymbol: true } },
        },
      }),
      this.prisma.investment.count({ where }),
    ]);
    return { items, total, page, pageSize: 50 };
  }

  findByReference(reference: string) {
    return this.prisma.investment.findUnique({ where: { paymentReference: reference.trim().toUpperCase() } });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireReservations() {
    const expired = await this.prisma.investment.findMany({
      where: { status: 'PENDING_PAYMENT', expiresAt: { lt: new Date() } },
      include: { opportunity: { select: { title: true } } },
    });
    if (expired.length === 0) return;
    await this.prisma.investment.updateMany({
      where: { id: { in: expired.map((e) => e.id) }, status: 'PENDING_PAYMENT' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await this.notifications.createMany(
      expired.map((e) => ({
        userId: e.userId,
        type: 'INVESTMENT_EXPIRED',
        title: 'Reserva caducada',
        body: `Tu reserva en ${e.opportunity.title} ha caducado sin recibir el pago.`,
        link: '/oportunidades',
      })),
    );
    this.logger.log(`${expired.length} reservas caducadas`);
  }

  // ---------------------------------------------------------------------

  private async evaluate(db: Prisma.TransactionClient, userId: string, dto: CreateInvestmentDto) {
    const [user, opportunity] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: userId } }),
      db.opportunity.findUnique({ where: { id: dto.opportunityId } }),
    ]);
    if (!opportunity) throw new NotFoundException('Oportunidad no encontrada');
    const now = new Date();
    const [held, sold, reserved, kycApproved] = await Promise.all([
      db.investment.aggregate({
        where: {
          userId,
          opportunityId: opportunity.id,
          OR: [{ status: { in: HELD } }, { status: 'PENDING_PAYMENT', expiresAt: { gt: now } }],
        },
        _sum: { tokens: true },
      }),
      db.investment.aggregate({ where: { opportunityId: opportunity.id, status: { in: HELD } }, _sum: { tokens: true } }),
      db.investment.aggregate({
        where: { opportunityId: opportunity.id, status: 'PENDING_PAYMENT', expiresAt: { gt: now } },
        _sum: { tokens: true },
      }),
      this.kyc.isApproved(userId),
    ]);

    const result = evaluateInvestment({
      now,
      tokens: dto.tokens,
      kycApproved,
      investorCountry: user.country,
      investorCategory: user.investorCategory,
      riskAcknowledged: dto.riskAcknowledged,
      acknowledgeRetailLimit: dto.acknowledgeRetailLimit,
      netWorthCents: dto.netWorthCents,
      heldOrReservedTokens: held._sum.tokens ?? 0,
      availableTokens: opportunity.totalTokens - (sold._sum.tokens ?? 0) - (reserved._sum.tokens ?? 0),
      retailSoftLimitCents: this.config.compliance.retailSoftLimitCents,
      opportunity: {
        ...opportunity,
        blockedCountries: [...opportunity.blockedCountries, ...this.config.compliance.globalBlockedCountries],
      },
    });
    return { result, opportunity };
  }

  private newReference(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(8);
    let ref = 'BC-';
    for (const b of bytes) ref += alphabet[b % alphabet.length];
    return ref;
  }

  private toInvestor<
    T extends {
      id: string;
      tokens: number;
      amountCents: number;
      status: InvestmentStatus;
      paymentMethod: string;
      paymentReference: string;
      expiresAt: Date;
      paidAt: Date | null;
      issuedAt: Date | null;
      mintTxHash: string | null;
      createdAt: Date;
      opportunityId: string;
      opportunity?: { title: string; slug: string; tokenSymbol?: string; status?: string };
    },
  >(i: T) {
    return {
      id: i.id,
      opportunityId: i.opportunityId,
      opportunity: i.opportunity
        ? { title: i.opportunity.title, slug: i.opportunity.slug, tokenSymbol: i.opportunity.tokenSymbol, status: i.opportunity.status }
        : undefined,
      tokens: i.tokens,
      amountCents: i.amountCents,
      status: i.status,
      paymentMethod: i.paymentMethod,
      paymentReference: i.paymentReference,
      expiresAt: i.expiresAt,
      paidAt: i.paidAt,
      issuedAt: i.issuedAt,
      mintTxHash: i.mintTxHash,
      mintExplorerUrl: this.chain.explorerTxUrl(i.mintTxHash),
      createdAt: i.createdAt,
    };
  }
}
