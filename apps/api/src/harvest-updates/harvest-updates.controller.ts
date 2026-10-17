import { Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Post } from '@nestjs/common';
import { HarvestStage } from '@prisma/client';
import { IsEnum, IsString, Length } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

export class CreateHarvestUpdateDto {
  @IsEnum(HarvestStage) stage: HarvestStage;
  @IsString() @Length(3, 140) title: string;
  @IsString() @Length(10, 10_000) body: string;
}

@Injectable()
export class HarvestUpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list(opportunityId: string) {
    return this.prisma.harvestUpdate.findMany({
      where: { opportunityId },
      orderBy: { publishedAt: 'desc' },
      include: { documents: { select: { id: true, title: true, type: true, mimeType: true, visibility: true } } },
    });
  }

  async create(actorId: string, opportunityId: string, dto: CreateHarvestUpdateDto) {
    const o = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!o) throw new NotFoundException('Oportunidad no encontrada');
    const update = await this.prisma.harvestUpdate.create({ data: { ...dto, opportunityId, authorId: actorId } });

    const holders = await this.prisma.investment.findMany({
      where: { opportunityId, status: { in: ['PAID', 'TOKENS_ISSUED'] } },
      select: { userId: true },
      distinct: ['userId'],
    });
    await this.notifications.createMany(
      holders.map((h) => ({
        userId: h.userId,
        type: 'HARVEST_UPDATE',
        title: `${o.title}: ${dto.title}`,
        body: dto.body.slice(0, 240),
        link: `/oportunidades/${o.slug}`,
      })),
    );
    await this.audit.log({ actorId, action: 'harvest_update.create', entity: 'HarvestUpdate', entityId: update.id });
    return update;
  }

  async remove(actorId: string, id: string) {
    const u = await this.prisma.harvestUpdate.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('Novedad no encontrada');
    await this.prisma.harvestUpdate.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'harvest_update.delete', entity: 'HarvestUpdate', entityId: id });
    return { ok: true };
  }
}

@Roles('ADMIN', 'OPERATOR')
@Controller('admin')
export class HarvestUpdatesController {
  constructor(private readonly updates: HarvestUpdatesService) {}

  @Get('opportunities/:id/updates')
  list(@Param('id') id: string) {
    return this.updates.list(id);
  }

  @Post('opportunities/:id/updates')
  create(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateHarvestUpdateDto) {
    return this.updates.create(user.id, id, dto);
  }

  @Delete('updates/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.updates.remove(user.id, id);
  }
}
