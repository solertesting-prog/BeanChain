import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { slugify } from '../common/slug';
import { CreateFarmDto, SanctionsCheckDto, UpdateFarmDto } from './farms.dto';

@Injectable()
export class FarmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.farm.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { opportunities: true } } },
    });
  }

  async get(id: string) {
    const farm = await this.prisma.farm.findUnique({
      where: { id },
      include: {
        opportunities: { select: { id: true, slug: true, title: true, status: true, harvestYear: true } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!farm) throw new NotFoundException('Finca no encontrada');
    return farm;
  }

  async create(actorId: string, dto: CreateFarmDto) {
    const slug = dto.slug ?? slugify(`${dto.name}-${dto.region}`);
    if (await this.prisma.farm.findUnique({ where: { slug } })) {
      throw new ConflictException('Ya existe una finca con ese identificador');
    }
    const farm = await this.prisma.farm.create({
      data: {
        ...dto,
        slug,
        country: dto.country.toUpperCase(),
        productionHistory: (dto.productionHistory ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.log({ actorId, action: 'farm.create', entity: 'Farm', entityId: farm.id });
    return farm;
  }

  async update(actorId: string, id: string, dto: UpdateFarmDto) {
    await this.get(id);
    const { productionHistory, ...rest } = dto;
    const farm = await this.prisma.farm.update({
      where: { id },
      data: {
        ...rest,
        ...(productionHistory ? { productionHistory: productionHistory as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'farm.update', entity: 'Farm', entityId: id, data: { fields: Object.keys(dto) } });
    return farm;
  }

  /**
   * Registra el resultado de la revisión de sanciones (OFAC/UE/ONU) del
   * propietario, la cooperativa y sus contrapartes. Sin esto no se puede
   * publicar ninguna oportunidad de la finca.
   */
  async recordSanctionsCheck(actorId: string, id: string, dto: SanctionsCheckDto) {
    await this.get(id);
    const farm = await this.prisma.farm.update({
      where: { id },
      data: { sanctionsClear: dto.clear, sanctionsNote: dto.note, sanctionsCheckedAt: new Date() },
    });
    await this.audit.log({ actorId, action: 'farm.sanctions_check', entity: 'Farm', entityId: id, data: { ...dto } });
    return farm;
  }
}
