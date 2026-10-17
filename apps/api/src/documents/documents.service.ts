import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType, DocumentVisibility } from '@prisma/client';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { CryptoService } from '../common/crypto.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.decorators';

export const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface UploadMeta {
  type: DocumentType;
  title: string;
  visibility?: DocumentVisibility;
  opportunityId?: string;
  farmId?: string;
  harvestUpdateId?: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly chain: BlockchainService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async upload(actorId: string, file: Express.Multer.File | undefined, meta: UploadMeta) {
    if (!file) throw new BadRequestException('Falta el fichero');
    if (!ALLOWED_MIME.has(file.mimetype)) throw new BadRequestException('Tipo de fichero no permitido');
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('El fichero supera los 25 MB');
    if (!meta.opportunityId && !meta.farmId) throw new BadRequestException('Indica la oportunidad o la finca');

    let subject = meta.farmId ?? '';
    if (meta.harvestUpdateId) {
      const u = await this.prisma.harvestUpdate.findUnique({ where: { id: meta.harvestUpdateId } });
      if (!u) throw new BadRequestException('La novedad no existe');
      meta.opportunityId = u.opportunityId;
    }
    if (meta.opportunityId) {
      const o = await this.prisma.opportunity.findUnique({ where: { id: meta.opportunityId } });
      if (!o) throw new BadRequestException('La oportunidad no existe');
      subject = o.id;
    } else if (meta.farmId && !(await this.prisma.farm.findUnique({ where: { id: meta.farmId } }))) {
      throw new BadRequestException('La finca no existe');
    }

    const sha256 = this.crypto.sha256Hex(file.buffer);
    if (await this.prisma.document.findUnique({ where: { sha256 } })) {
      throw new ConflictException('Este documento ya está subido');
    }
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
    const storageKey = `documents/${sha256}${ext}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);

    const doc = await this.prisma.document.create({
      data: {
        type: meta.type,
        title: meta.title,
        visibility: meta.visibility ?? 'INVESTORS',
        opportunityId: meta.opportunityId ?? null,
        farmId: meta.opportunityId ? null : meta.farmId ?? null,
        harvestUpdateId: meta.harvestUpdateId ?? null,
        fileName: file.originalname.slice(0, 200),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        sha256,
        uploadedById: actorId,
      },
    });

    // Las fotos no se anclan: el resto sí, como prueba de integridad.
    if (meta.type !== 'PHOTO') {
      const txHash = await this.chain.anchorDocument(sha256, subject, meta.type, `beanchain:document:${doc.id}`);
      await this.prisma.document.update({ where: { id: doc.id }, data: { anchoredTxHash: txHash, anchoredAt: new Date() } });
    }

    await this.audit.log({ actorId, action: 'document.upload', entity: 'Document', entityId: doc.id, data: { sha256, type: meta.type } });
    return this.prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
  }

  async download(id: string, user?: AuthUser) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.assertCanRead(doc, user);
    const body = await this.storage.get(doc.storageKey);
    return { doc, body };
  }

  async verify(sha256: string) {
    const hash = sha256.toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new BadRequestException('Hash SHA-256 no válido');
    const doc = await this.prisma.document.findUnique({
      where: { sha256: hash },
      include: { opportunity: { select: { title: true, slug: true } } },
    });
    if (!doc) return { found: false, sha256: hash };
    return {
      found: true,
      sha256: hash,
      title: doc.visibility === 'ADMIN' ? 'Documento interno' : doc.title,
      type: doc.type,
      opportunity: doc.visibility === 'ADMIN' ? null : doc.opportunity,
      uploadedAt: doc.createdAt,
      anchoredAt: doc.anchoredAt,
      anchoredTxHash: doc.anchoredTxHash,
      explorerUrl: this.chain.explorerTxUrl(doc.anchoredTxHash),
    };
  }

  async remove(actorId: string, id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id }, include: { opportunity: true } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.opportunity && doc.opportunity.status !== 'DRAFT') {
      throw new ConflictException('No se pueden borrar documentos de una oportunidad publicada');
    }
    await this.prisma.document.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'document.delete', entity: 'Document', entityId: id });
    return { ok: true };
  }

  private async assertCanRead(
    doc: { visibility: DocumentVisibility; opportunityId: string | null },
    user?: AuthUser,
  ) {
    if (doc.visibility === 'PUBLIC') return;
    if (!user) throw new ForbiddenException('Inicia sesión para ver este documento');
    if (user.role === 'ADMIN' || user.role === 'OPERATOR') return;
    if (doc.visibility === 'ADMIN') throw new ForbiddenException();
    // INVESTORS: titulares de la oportunidad o inversores con KYC aprobado que la estudian.
    if (doc.opportunityId) {
      const [held, kyc] = await Promise.all([
        this.prisma.investment.count({
          where: { userId: user.id, opportunityId: doc.opportunityId, status: { in: ['PAID', 'TOKENS_ISSUED'] } },
        }),
        this.prisma.kycVerification.count({ where: { userId: user.id, status: 'APPROVED' } }),
      ]);
      if (held > 0 || kyc > 0) return;
    }
    throw new ForbiddenException('Verifica tu identidad para acceder a este documento');
  }
}
