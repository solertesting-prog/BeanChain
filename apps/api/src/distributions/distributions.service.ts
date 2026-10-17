import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DistributionKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { NotificationsService } from '../notifications/notifications.service';
import { allocateProRata } from '../common/money';

const CLAIM_BATCH = 100;

@Injectable()
export class DistributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly chain: BlockchainService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Titulares actuales según las emisiones registradas. */
  async holders(opportunityId: string) {
    const rows = await this.prisma.investment.groupBy({
      by: ['userId'],
      where: { opportunityId, status: 'TOKENS_ISSUED' },
      _sum: { tokens: true },
    });
    return rows
      .map((r) => ({ userId: r.userId, tokens: r._sum.tokens ?? 0 }))
      .filter((r) => r.tokens > 0)
      .sort((a, b) => a.userId.localeCompare(b.userId));
  }

  async preview(opportunityId: string, totalAmountCents: number) {
    const holders = await this.holders(opportunityId);
    const allocation = allocateProRata(holders, totalAmountCents);
    const totalTokens = holders.reduce((s, h) => s + h.tokens, 0);
    return {
      totalTokens,
      holders: allocation.length,
      perTokenCents: totalTokens ? totalAmountCents / totalTokens : 0,
      allocation,
    };
  }

  async create(actorId: string, dto: { opportunityId: string; kind: DistributionKind; totalAmountCents: number; note?: string }) {
    const o = await this.prisma.opportunity.findUnique({ where: { id: dto.opportunityId } });
    if (!o) throw new NotFoundException('Oportunidad no encontrada');
    if (!['ACTIVE', 'DISTRIBUTING'].includes(o.status)) {
      throw new BadRequestException('Sólo se reparte en oportunidades activas o en reparto');
    }
    const { allocation } = await this.preview(o.id, dto.totalAmountCents);
    if (allocation.length === 0) throw new BadRequestException('No hay titulares con tokens emitidos');

    const d = await this.prisma.distribution.create({
      data: {
        opportunityId: o.id,
        kind: dto.kind,
        totalAmountCents: dto.totalAmountCents,
        note: dto.note,
        payouts: {
          create: allocation.map((a) => ({ userId: a.userId, tokens: a.tokens, amountCents: a.amountCents })),
        },
      },
      include: { payouts: true },
    });
    await this.audit.log({ actorId, action: 'distribution.create', entity: 'Distribution', entityId: d.id, data: { ...dto } });
    return d;
  }

  /**
   * Ejecuta el reparto on-chain: deposita el stablecoin en el token y empuja
   * el pago a las wallets custodiadas (las externas lo reclaman ellas).
   */
  async execute(actorId: string, id: string) {
    const d = await this.prisma.distribution.findUnique({
      where: { id },
      include: { opportunity: true, payouts: { include: { user: { include: { wallet: true } } } } },
    });
    if (!d) throw new NotFoundException('Reparto no encontrado');
    if (d.status === 'EXECUTED') throw new ConflictException('Este reparto ya se ejecutó');
    if (!d.opportunity.tokenAddress) throw new ConflictException('La oportunidad no tiene token desplegado');

    try {
      const txHash = await this.chain.distribute(d.opportunity.tokenAddress, d.totalAmountCents, d.id);

      const custodial = d.payouts.filter((p) => p.user.wallet?.custodial).map((p) => ({ id: p.id, address: p.user.wallet!.address }));
      for (let i = 0; i < custodial.length; i += CLAIM_BATCH) {
        const batch = custodial.slice(i, i + CLAIM_BATCH);
        const claimTx = await this.chain.claimFor(d.opportunity.tokenAddress, batch.map((b) => b.address), d.id);
        await this.prisma.distributionPayout.updateMany({
          where: { id: { in: batch.map((b) => b.id) } },
          data: { claimTxHash: claimTx },
        });
      }

      const updated = await this.prisma.distribution.update({
        where: { id },
        data: { status: 'EXECUTED', txHash, executedAt: new Date(), error: null },
      });
      if (d.opportunity.status === 'ACTIVE') {
        await this.prisma.opportunity.update({ where: { id: d.opportunityId }, data: { status: 'DISTRIBUTING' } });
      }

      const fmt = (c: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(c / 100);
      await this.notifications.createMany(
        d.payouts.map((p) => ({
          userId: p.userId,
          type: 'PAYOUT',
          title: 'Has recibido un pago',
          body: `${fmt(p.amountCents)} de ${d.opportunity.title} (${p.tokens} tokens).`,
          link: '/cartera',
        })),
      );
      await this.audit.log({ actorId, action: 'distribution.execute', entity: 'Distribution', entityId: id, data: { txHash } });
      return updated;
    } catch (err) {
      await this.prisma.distribution.update({
        where: { id },
        data: { status: 'FAILED', error: (err as Error).message.slice(0, 1000) },
      });
      throw err;
    }
  }

  list(opportunityId?: string) {
    return this.prisma.distribution.findMany({
      where: opportunityId ? { opportunityId } : {},
      orderBy: { createdAt: 'desc' },
      include: { opportunity: { select: { title: true, slug: true } }, _count: { select: { payouts: true } } },
    });
  }

  async get(id: string) {
    const d = await this.prisma.distribution.findUnique({
      where: { id },
      include: {
        opportunity: { select: { title: true, slug: true, tokenAddress: true } },
        payouts: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
      },
    });
    if (!d) throw new NotFoundException('Reparto no encontrado');
    return { ...d, explorerUrl: this.chain.explorerTxUrl(d.txHash) };
  }
}
