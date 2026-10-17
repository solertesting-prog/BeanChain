import { Injectable, NotFoundException } from '@nestjs/common';
import { InvestorCategory, Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

const PUBLIC_USER_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  country: true,
  locale: true,
  role: true,
  status: true,
  investorCategory: true,
  emailVerifiedAt: true,
  mfaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...PUBLIC_USER_FIELDS,
        wallet: { select: { address: true, custodial: true, onchainRegisteredAt: true } },
        kyc: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, provider: true, approvedAt: true, expiresAt: true, rejectReason: true },
        },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const { kyc, ...rest } = user;
    return { ...rest, kyc: kyc[0] ?? { status: 'NOT_STARTED' } };
  }

  async updateProfile(userId: string, data: { firstName?: string; lastName?: string; phone?: string | null; locale?: string }) {
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.profile(userId);
  }

  async list(params: { q?: string; role?: Role; page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const where: Prisma.UserWhereInput = {
      ...(params.role ? { role: params.role } : {}),
      ...(params.q
        ? {
            OR: [
              { email: { contains: params.q, mode: 'insensitive' } },
              { firstName: { contains: params.q, mode: 'insensitive' } },
              { lastName: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          ...PUBLIC_USER_FIELDS,
          kyc: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
          _count: { select: { investments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map(({ kyc, ...u }) => ({ ...u, kycStatus: kyc[0]?.status ?? 'NOT_STARTED' })),
      total,
      page,
      pageSize,
    };
  }

  async adminUpdate(
    actorId: string,
    userId: string,
    data: { role?: Role; status?: UserStatus; investorCategory?: InvestorCategory },
  ) {
    const exists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) throw new NotFoundException('Usuario no encontrado');
    await this.prisma.user.update({ where: { id: userId }, data });
    if (data.status === 'SUSPENDED') {
      await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.log({ actorId, action: 'user.admin_update', entity: 'User', entityId: userId, data });
    return this.profile(userId);
  }
}
