import { Controller, Get, Injectable } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { bpsOf } from '../common/money';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: BlockchainService,
  ) {}

  async summary(userId: string) {
    const [investments, payouts, wallet] = await Promise.all([
      this.prisma.investment.findMany({
        where: { userId, status: { in: ['PENDING_PAYMENT', 'PAID', 'TOKENS_ISSUED'] } },
        include: {
          opportunity: {
            include: {
              farm: { select: { name: true, crop: true, region: true, country: true } },
              updates: { orderBy: { publishedAt: 'desc' }, take: 1, select: { stage: true, title: true, publishedAt: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.distributionPayout.findMany({
        where: { userId, distribution: { status: 'EXECUTED' } },
        include: { distribution: { select: { opportunityId: true, kind: true, executedAt: true, txHash: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.wallet.findUnique({ where: { userId } }),
    ]);

    // Agrupa por oportunidad.
    const byOpp = new Map<string, {
      opportunity: (typeof investments)[number]['opportunity'];
      tokens: number;
      investedCents: number;
      pendingTokens: number;
      pendingCents: number;
    }>();
    for (const inv of investments) {
      const entry = byOpp.get(inv.opportunityId) ?? {
        opportunity: inv.opportunity,
        tokens: 0,
        investedCents: 0,
        pendingTokens: 0,
        pendingCents: 0,
      };
      if (inv.status === 'PENDING_PAYMENT') {
        if (inv.expiresAt > new Date()) {
          entry.pendingTokens += inv.tokens;
          entry.pendingCents += inv.amountCents;
        }
      } else {
        entry.tokens += inv.tokens;
        entry.investedCents += inv.amountCents;
      }
      byOpp.set(inv.opportunityId, entry);
    }

    const holdings = Array.from(byOpp.values()).map((h) => {
      const o = h.opportunity;
      const received = payouts.filter((p) => p.distribution.opportunityId === o.id).reduce((s, p) => s + p.amountCents, 0);
      const expectedTotalCents = h.investedCents + bpsOf(h.investedCents, o.expectedReturnBps);
      return {
        opportunity: {
          id: o.id,
          slug: o.slug,
          title: o.title,
          status: o.status,
          harvestYear: o.harvestYear,
          tokenSymbol: o.tokenSymbol,
          tokenAddress: o.tokenAddress,
          explorerUrl: this.chain.explorerAddressUrl(o.tokenAddress),
          expectedReturnBps: o.expectedReturnBps,
          expectedPayoutAt: o.expectedPayoutAt,
          farm: o.farm,
          latestUpdate: o.updates[0] ?? null,
        },
        tokens: h.tokens,
        pendingTokens: h.pendingTokens,
        pendingCents: h.pendingCents,
        investedCents: h.investedCents,
        receivedCents: received,
        expectedTotalCents,
        // Valor estimado: lo esperado menos lo ya cobrado, sin bajar de 0.
        estimatedValueCents: o.status === 'CLOSED' ? 0 : Math.max(0, expectedTotalCents - received),
      };
    });

    const totals = holdings.reduce(
      (acc, h) => ({
        investedCents: acc.investedCents + h.investedCents,
        receivedCents: acc.receivedCents + h.receivedCents,
        estimatedValueCents: acc.estimatedValueCents + h.estimatedValueCents,
        pendingCents: acc.pendingCents + h.pendingCents,
      }),
      { investedCents: 0, receivedCents: 0, estimatedValueCents: 0, pendingCents: 0 },
    );

    const nextPayout = holdings
      .filter((h) => h.tokens > 0 && h.opportunity.expectedPayoutAt && h.opportunity.status !== 'CLOSED')
      .sort((a, b) => +a.opportunity.expectedPayoutAt! - +b.opportunity.expectedPayoutAt!)[0];

    return {
      totals,
      nextPayout: nextPayout
        ? {
            opportunityTitle: nextPayout.opportunity.title,
            expectedAt: nextPayout.opportunity.expectedPayoutAt,
            estimatedCents: nextPayout.estimatedValueCents,
          }
        : null,
      holdings,
      payouts: payouts.map((p) => ({
        id: p.id,
        opportunityId: p.distribution.opportunityId,
        kind: p.distribution.kind,
        amountCents: p.amountCents,
        tokens: p.tokens,
        executedAt: p.distribution.executedAt,
        explorerUrl: this.chain.explorerTxUrl(p.claimTxHash ?? p.distribution.txHash),
      })),
      wallet: wallet
        ? {
            address: wallet.address,
            custodial: wallet.custodial,
            verified: Boolean(wallet.onchainRegisteredAt),
            explorerUrl: this.chain.explorerAddressUrl(wallet.address),
          }
        : null,
    };
  }
}

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.portfolio.summary(user.id);
  }
}
