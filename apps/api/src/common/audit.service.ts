import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: Record<string, unknown>;
  ip?: string | null;
}

/** Registro inmutable de acciones relevantes (requisito de trazabilidad regulatoria). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          data: (entry.data ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: entry.ip ?? null,
        },
      });
    } catch (err) {
      // La auditoría nunca debe tumbar la operación principal, pero sí dejar rastro.
      this.logger.error(`No se pudo registrar auditoría ${entry.action}: ${(err as Error).message}`);
    }
  }
}
