import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType, InvestmentStatus, Opportunity, OpportunityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppConfig } from '../config/app-config';
import { slugify } from '../common/slug';
import { AuthUser } from '../common/auth.decorators';
import { CreateOpportunityDto, UpdateOpportunityDto } from './opportunities.dto';

export const PUBLIC_STATUSES: OpportunityStatus[] = ['PUBLISHED', 'FUNDED', 'ACTIVE', 'DISTRIBUTING', 'CLOSED'];

/** Documentos mínimos para publicar una oportunidad. */
export const REQUIRED_DOCUMENTS: DocumentType[][] = [
  ['CONTRACT'],
  ['PROSPECTUS', 'KEY_INFO_SHEET'],
  ['AGRONOMY_REPORT'],
  ['BUYER_LETTER'],
];

const TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  DRAFT: ['CANCELLED'], // la publicación va por publish()
  PUBLISHED: ['FUNDED', 'CANCELLED'],
  FUNDED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['DISTRIBUTING'],
  DISTRIBUTING: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

const ACTIVE_INVESTMENT = { in: ['PAID', 'TOKENS_ISSUED'] as InvestmentStatus[] };

export interface OpportunityStats {
  tokensSold: number;
  tokensReserved: number;
  tokensAvailable: number;
  raisedCents: number;
  investorsCount: number;
  progressPct: number;
}

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly chain: BlockchainService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------------
  // Lectura pública
  // ---------------------------------------------------------------------

  async publicList() {
    const items = await this.prisma.opportunity.findMany({
      where: { status: { in: PUBLIC_STATUSES } },
      orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }],
      include: {
        farm: { select: { name: true, crop: true, varieties: true, country: true, region: true, hectares: true } },
        updates: { orderBy: { publishedAt: 'desc' }, take: 1, select: { stage: true } },
      },
    });
    const stats = await this.statsFor(items);
    return items.map((o) => this.toPublic(o, stats.get(o.id)!));
  }

  async publicDetail(slug: string, user?: AuthUser) {
    const o = await this.prisma.opportunity.findUnique({
      where: { slug },
      include: {
        farm: true,
        updates: {
          orderBy: { publishedAt: 'desc' },
          include: { documents: { where: { visibility: 'PUBLIC' }, select: { id: true, title: true, type: true, mimeType: true } } },
        },
        documents: { orderBy: { createdAt: 'asc' } },
      },
    });
    const isStaff = user && (user.role === 'ADMIN' || user.role === 'OPERATOR');
    if (!o || (!PUBLIC_STATUSES.includes(o.status) && !isStaff)) {
      throw new NotFoundException('Oportunidad no encontrada');
    }

    const isInvestor = user
      ? (await this.prisma.investment.count({ where: { userId: user.id, opportunityId: o.id, status: ACTIVE_INVESTMENT } })) > 0
      : false;

    // Los documentos "para inversores" los ven los titulares y cualquier usuario
    // con KYC aprobado (los necesita para decidir si invierte).
    const kycApproved = user
      ? (await this.prisma.kycVerification.count({ where: { userId: user.id, status: 'APPROVED' } })) > 0
      : false;
    const visibleDocs = o.documents.filter(
      (d) =>
        d.visibility === 'PUBLIC' ||
        (d.visibility === 'INVESTORS' && (isInvestor || kycApproved)) ||
        isStaff,
    );
    const stats = (await this.statsFor([o])).get(o.id)!;
    const { farm, updates } = o;

    return {
      ...this.toPublic({ ...o, updates: updates.slice(0, 1) }, stats),
      description: o.description,
      risks: o.risks,
      buyerName: o.buyerName,
      platformFeeBps: o.platformFeeBps,
      expectedPayoutAt: o.expectedPayoutAt,
      blockedCountries: Array.from(new Set([...o.blockedCountries, ...this.config.compliance.globalBlockedCountries])),
      farm: {
        name: farm.name,
        crop: farm.crop,
        varieties: farm.varieties,
        country: farm.country,
        region: farm.region,
        municipality: farm.municipality,
        hectares: farm.hectares,
        altitudeM: farm.altitudeM,
        latitude: farm.latitude,
        longitude: farm.longitude,
        description: farm.description,
        ownerName: farm.ownerName,
        ownerType: farm.ownerType,
        productionHistory: farm.productionHistory,
      },
      token: {
        name: o.tokenName,
        symbol: o.tokenSymbol,
        standard: 'ERC-3643',
        address: o.tokenAddress,
        chainId: o.chainId,
        explorerUrl: this.chain.explorerAddressUrl(o.tokenAddress),
        deployTxHash: o.deployTxHash,
        decimals: 0,
      },
      updates: updates.map((u) => ({
        id: u.id,
        stage: u.stage,
        title: u.title,
        body: u.body,
        publishedAt: u.publishedAt,
        documents: u.documents,
      })),
      documents: visibleDocs.map((d) => ({
        id: d.id,
        type: d.type,
        title: d.title,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        sha256: d.sha256,
        visibility: d.visibility,
        anchoredTxHash: d.anchoredTxHash,
        anchoredAt: d.anchoredAt,
        explorerUrl: this.chain.explorerTxUrl(d.anchoredTxHash),
      })),
      viewer: { isInvestor, kycApproved },
    };
  }

  // ---------------------------------------------------------------------
  // Estadísticas
  // ---------------------------------------------------------------------

  async statsFor(items: Pick<Opportunity, 'id' | 'totalTokens' | 'tokenPriceCents'>[]): Promise<Map<string, OpportunityStats>> {
    const ids = items.map((i) => i.id);
    const now = new Date();
    const [sold, reserved, investors] = await Promise.all([
      this.prisma.investment.groupBy({
        by: ['opportunityId'],
        where: { opportunityId: { in: ids }, status: ACTIVE_INVESTMENT },
        _sum: { tokens: true, amountCents: true },
      }),
      this.prisma.investment.groupBy({
        by: ['opportunityId'],
        where: { opportunityId: { in: ids }, status: 'PENDING_PAYMENT', expiresAt: { gt: now } },
        _sum: { tokens: true },
      }),
      this.prisma.investment.groupBy({
        by: ['opportunityId', 'userId'],
        where: { opportunityId: { in: ids }, status: ACTIVE_INVESTMENT },
      }),
    ]);
    const map = new Map<string, OpportunityStats>();
    for (const o of items) {
      const s = sold.find((x) => x.opportunityId === o.id);
      const r = reserved.find((x) => x.opportunityId === o.id);
      const tokensSold = s?._sum.tokens ?? 0;
      const tokensReserved = r?._sum.tokens ?? 0;
      map.set(o.id, {
        tokensSold,
        tokensReserved,
        tokensAvailable: Math.max(0, o.totalTokens - tokensSold - tokensReserved),
        raisedCents: tokensSold * o.tokenPriceCents,
        investorsCount: investors.filter((x) => x.opportunityId === o.id).length,
        progressPct: o.totalTokens > 0 ? Math.round((tokensSold / o.totalTokens) * 1000) / 10 : 0,
      });
    }
    return map;
  }

  private toPublic(
    o: Opportunity & {
      farm: { name: string; crop: string; varieties: string[]; country: string; region: string; hectares: number };
      updates?: { stage: string }[];
    },
    stats: OpportunityStats,
  ) {
    return {
      id: o.id,
      slug: o.slug,
      title: o.title,
      summary: o.summary,
      status: o.status,
      harvestYear: o.harvestYear,
      coverImageUrl: o.coverImageUrl,
      targetAmountCents: o.targetAmountCents,
      tokenPriceCents: o.tokenPriceCents,
      totalTokens: o.totalTokens,
      minTokens: o.minTokens,
      maxTokensPerInvestor: o.maxTokensPerInvestor,
      expectedReturnBps: o.expectedReturnBps,
      termMonths: o.termMonths,
      riskLevel: o.riskLevel,
      opensAt: o.opensAt,
      closesAt: o.closesAt,
      publishedAt: o.publishedAt,
      tokenSymbol: o.tokenSymbol,
      currentStage: o.updates?.[0]?.stage ?? null,
      farm: {
        name: o.farm.name,
        crop: o.farm.crop,
        varieties: o.farm.varieties,
        country: o.farm.country,
        region: o.farm.region,
        hectares: o.farm.hectares,
      },
      stats,
    };
  }

  // ---------------------------------------------------------------------
  // Administración
  // ---------------------------------------------------------------------

  async adminList() {
    const items = await this.prisma.opportunity.findMany({
      orderBy: { createdAt: 'desc' },
      include: { farm: { select: { name: true, crop: true, varieties: true, country: true, region: true, hectares: true } } },
    });
    const stats = await this.statsFor(items);
    return items.map((o) => ({ ...this.toPublic(o, stats.get(o.id)!), tokenAddress: o.tokenAddress }));
  }

  async adminGet(id: string) {
    const o = await this.prisma.opportunity.findUnique({
      where: { id },
      include: {
        farm: true,
        documents: { orderBy: { createdAt: 'asc' } },
        distributions: { orderBy: { createdAt: 'desc' } },
        updates: { orderBy: { publishedAt: 'desc' } },
        investments: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true, country: true } } },
        },
      },
    });
    if (!o) throw new NotFoundException('Oportunidad no encontrada');
    const stats = (await this.statsFor([o])).get(o.id)!;
    return { ...o, stats, publishChecklist: await this.publishChecklist(o.id) };
  }

  async create(actorId: string, dto: CreateOpportunityDto) {
    const farm = await this.prisma.farm.findUnique({ where: { id: dto.farmId } });
    if (!farm) throw new BadRequestException('La finca no existe');
    const slug = dto.slug ?? slugify(`${farm.name}-${dto.harvestYear}-${dto.tokenSymbol}`);
    if (await this.prisma.opportunity.findUnique({ where: { slug } })) throw new ConflictException('Slug ya en uso');
    if (await this.prisma.opportunity.findUnique({ where: { tokenSymbol: dto.tokenSymbol } })) {
      throw new ConflictException('Símbolo de token ya en uso');
    }
    this.validateEconomics(dto);

    const cropName = farm.crop === 'CACAO' ? 'Cacao' : 'Café';
    const o = await this.prisma.opportunity.create({
      data: {
        farmId: farm.id,
        slug,
        title: dto.title,
        summary: dto.summary,
        description: dto.description,
        harvestYear: dto.harvestYear,
        tokenPriceCents: dto.tokenPriceCents,
        totalTokens: dto.totalTokens,
        targetAmountCents: dto.tokenPriceCents * dto.totalTokens,
        minTokens: dto.minTokens ?? 1,
        maxTokensPerInvestor: dto.maxTokensPerInvestor ?? null,
        expectedReturnBps: dto.expectedReturnBps,
        termMonths: dto.termMonths,
        platformFeeBps: dto.platformFeeBps ?? 300,
        buyerName: dto.buyerName ?? null,
        riskLevel: dto.riskLevel ?? 'HIGH',
        risks: dto.risks,
        opensAt: dto.opensAt ? new Date(dto.opensAt) : null,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
        expectedPayoutAt: dto.expectedPayoutAt ? new Date(dto.expectedPayoutAt) : null,
        blockedCountries: (dto.blockedCountries ?? []).map((c) => c.toUpperCase()),
        maxHolders: dto.maxHolders ?? null,
        tokenSymbol: dto.tokenSymbol,
        tokenName: dto.tokenName ?? `${cropName} ${farm.name} ${dto.harvestYear}`,
        coverImageUrl: dto.coverImageUrl ?? null,
      },
    });
    await this.audit.log({ actorId, action: 'opportunity.create', entity: 'Opportunity', entityId: o.id });
    return o;
  }

  async update(actorId: string, id: string, dto: UpdateOpportunityDto) {
    const o = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('Oportunidad no encontrada');

    const economic: (keyof UpdateOpportunityDto)[] = [
      'tokenPriceCents', 'totalTokens', 'minTokens', 'maxTokensPerInvestor', 'expectedReturnBps',
      'termMonths', 'platformFeeBps', 'blockedCountries', 'maxHolders',
    ];
    if (o.status !== 'DRAFT' && economic.some((k) => dto[k] !== undefined)) {
      throw new BadRequestException('Las condiciones económicas no se pueden cambiar tras publicar');
    }
    const merged = { ...o, ...dto } as unknown as CreateOpportunityDto;
    this.validateEconomics(merged);

    const data: Prisma.OpportunityUpdateInput = {
      ...dto,
      opensAt: dto.opensAt ? new Date(dto.opensAt) : undefined,
      closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
      expectedPayoutAt: dto.expectedPayoutAt ? new Date(dto.expectedPayoutAt) : undefined,
      blockedCountries: dto.blockedCountries?.map((c) => c.toUpperCase()),
    };
    if (dto.tokenPriceCents !== undefined || dto.totalTokens !== undefined) {
      data.targetAmountCents = (dto.tokenPriceCents ?? o.tokenPriceCents) * (dto.totalTokens ?? o.totalTokens);
    }
    const updated = await this.prisma.opportunity.update({ where: { id }, data });
    await this.audit.log({ actorId, action: 'opportunity.update', entity: 'Opportunity', entityId: id, data: { fields: Object.keys(dto) } });
    return updated;
  }

  private validateEconomics(dto: Pick<CreateOpportunityDto, 'minTokens' | 'maxTokensPerInvestor' | 'totalTokens' | 'tokenPriceCents' | 'opensAt' | 'closesAt'>) {
    const min = dto.minTokens ?? 1;
    if (min > dto.totalTokens) throw new BadRequestException('El mínimo por inversor supera la emisión');
    if (dto.maxTokensPerInvestor && dto.maxTokensPerInvestor < min) {
      throw new BadRequestException('El máximo por inversor es menor que el mínimo');
    }
    if (dto.tokenPriceCents * dto.totalTokens > 5_000_000_00) {
      throw new BadRequestException('El objetivo supera los 5 M€ permitidos por proyecto (Reglamento UE 2020/1503)');
    }
    if (dto.opensAt && dto.closesAt && new Date(dto.opensAt) >= new Date(dto.closesAt)) {
      throw new BadRequestException('La fecha de cierre debe ser posterior a la de apertura');
    }
  }

  async publishChecklist(id: string) {
    const o = await this.prisma.opportunity.findUniqueOrThrow({
      where: { id },
      include: { farm: true, documents: { select: { type: true } } },
    });
    const types = new Set(o.documents.map((d) => d.type));
    const missingDocs = REQUIRED_DOCUMENTS.filter((group) => !group.some((t) => types.has(t))).map((g) => g.join(' o '));
    const items = [
      { key: 'sanctions', ok: o.farm.sanctionsClear, label: 'Revisión de sanciones de la finca aprobada' },
      { key: 'documents', ok: missingDocs.length === 0, label: 'Documentación obligatoria subida', missing: missingDocs },
      { key: 'closesAt', ok: !!o.closesAt && o.closesAt > new Date(), label: 'Fecha de cierre de la captación en el futuro' },
      { key: 'status', ok: o.status === 'DRAFT', label: 'La oportunidad está en borrador' },
    ];
    return { ready: items.every((i) => i.ok), items };
  }

  /** Publica la oportunidad y despliega su token en la blockchain. */
  async publish(actorId: string, id: string) {
    const checklist = await this.publishChecklist(id);
    if (!checklist.ready) {
      throw new BadRequestException({
        message: 'La oportunidad no cumple los requisitos para publicarse',
        checklist,
      });
    }
    const o = await this.prisma.opportunity.findUniqueOrThrow({ where: { id } });

    const deployed = await this.chain.deployHarvestToken({
      name: o.tokenName,
      symbol: o.tokenSymbol,
      harvestId: o.id,
      cap: o.totalTokens,
      blockedCountries: Array.from(new Set([...o.blockedCountries, ...this.config.compliance.globalBlockedCountries])),
      maxHolders: o.maxHolders,
      maxTokensPerInvestor: o.maxTokensPerInvestor,
    });

    const updated = await this.prisma.opportunity.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        opensAt: o.opensAt ?? new Date(),
        tokenAddress: deployed.tokenAddress,
        complianceAddress: deployed.complianceAddress,
        chainId: deployed.chainId,
        deployTxHash: deployed.txHash,
      },
    });
    await this.audit.log({
      actorId,
      action: 'opportunity.publish',
      entity: 'Opportunity',
      entityId: id,
      data: { tokenAddress: deployed.tokenAddress, txHash: deployed.txHash },
    });
    return updated;
  }

  async transition(actorId: string, id: string, to: OpportunityStatus, reason?: string) {
    const o = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('Oportunidad no encontrada');
    if (!TRANSITIONS[o.status].includes(to)) {
      throw new BadRequestException(`No se puede pasar de ${o.status} a ${to}`);
    }

    if (to === 'FUNDED') {
      // Al cerrar la captación se anulan las reservas sin pagar.
      await this.prisma.investment.updateMany({
        where: { opportunityId: id, status: 'PENDING_PAYMENT' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    }
    if (to === 'CANCELLED') await this.refundAll(o);
    if (to === 'CLOSED' && o.tokenAddress) await this.chain.closeToken(o.tokenAddress, o.id);

    const updated = await this.prisma.opportunity.update({ where: { id }, data: { status: to } });
    await this.audit.log({ actorId, action: 'opportunity.transition', entity: 'Opportunity', entityId: id, data: { from: o.status, to, reason } });

    const holders = await this.prisma.investment.findMany({
      where: { opportunityId: id, status: { in: ['PAID', 'TOKENS_ISSUED', 'REFUNDED'] } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const messages: Partial<Record<OpportunityStatus, string>> = {
      FUNDED: 'La captación ha cerrado. Empieza la financiación de la cosecha.',
      ACTIVE: 'La cosecha está en curso. Te iremos informando de cada etapa.',
      DISTRIBUTING: 'La cosecha se ha vendido y comienzan los repartos.',
      CLOSED: 'La inversión ha finalizado. Gracias por participar.',
      CANCELLED: 'La oportunidad se ha cancelado. Te devolveremos tu inversión.',
    };
    if (messages[to]) {
      await this.notifications.createMany(
        holders.map((h) => ({
          userId: h.userId,
          type: `OPPORTUNITY_${to}`,
          title: o.title,
          body: messages[to]!,
          link: `/oportunidades/${o.slug}`,
        })),
      );
    }
    return updated;
  }

  private async refundAll(o: Opportunity) {
    const investments = await this.prisma.investment.findMany({
      where: { opportunityId: o.id, status: { in: ['PENDING_PAYMENT', 'PAID', 'TOKENS_ISSUED'] } },
      include: { user: { include: { wallet: true } } },
    });
    for (const inv of investments) {
      if (inv.status === 'TOKENS_ISSUED' && o.tokenAddress && inv.user.wallet) {
        await this.chain.burn(o.tokenAddress, inv.user.wallet.address, inv.tokens, inv.id);
      }
      await this.prisma.investment.update({
        where: { id: inv.id },
        data:
          inv.status === 'PENDING_PAYMENT'
            ? { status: 'CANCELLED', cancelledAt: new Date() }
            : { status: 'REFUNDED', cancelledAt: new Date() },
      });
    }
    this.logger.log(`Oportunidad ${o.id} cancelada: ${investments.length} inversiones anuladas o a devolver`);
  }
}
