import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Roles, Public } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { BlockchainService } from '../blockchain/blockchain.service';

class AuditQuery {
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

@Controller()
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: BlockchainService,
  ) {}

  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, blockchain: this.chain.isLive ? 'live' : 'simulated', chainId: this.chain.chainId };
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get('admin/stats')
  async stats() {
    const [users, kycPending, kycApproved, opportunities, raised, pendingPayments, distributed, recentTx] = await Promise.all([
      this.prisma.user.count({ where: { role: 'INVESTOR' } }),
      this.prisma.kycVerification.count({ where: { status: 'PENDING' } }),
      this.prisma.kycVerification.count({ where: { status: 'APPROVED' } }),
      this.prisma.opportunity.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.investment.aggregate({ where: { status: { in: ['PAID', 'TOKENS_ISSUED'] } }, _sum: { amountCents: true } }),
      this.prisma.investment.aggregate({
        where: { status: 'PENDING_PAYMENT', expiresAt: { gt: new Date() } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      this.prisma.distribution.aggregate({ where: { status: 'EXECUTED' }, _sum: { totalAmountCents: true } }),
      this.prisma.chainTransaction.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return {
      investors: users,
      kyc: { pending: kycPending, approved: kycApproved },
      opportunities: Object.fromEntries(opportunities.map((o) => [o.status, o._count._all])),
      raisedCents: raised._sum.amountCents ?? 0,
      pendingPayments: { count: pendingPayments._count._all, amountCents: pendingPayments._sum.amountCents ?? 0 },
      distributedCents: distributed._sum.totalAmountCents ?? 0,
      recentTransactions: recentTx.map((t) => ({ ...t, explorerUrl: this.chain.explorerTxUrl(t.txHash) })),
      blockchainMode: this.chain.isLive ? 'live' : 'simulated',
    };
  }

  @Roles('ADMIN')
  @Get('admin/audit')
  async audit(@Query() q: AuditQuery) {
    const page = q.page ?? 1;
    const where = { ...(q.entity ? { entity: q.entity } : {}), ...(q.entityId ? { entityId: q.entityId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
        include: { actor: { select: { email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize: 50 };
  }
}
