import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Wallet as EthersWallet, getAddress, verifyMessage } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuditService } from '../common/audit.service';

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly chain: BlockchainService,
    private readonly audit: AuditService,
  ) {}

  /** Mensaje que el usuario firma para demostrar que controla una wallet externa. */
  static linkMessage(userId: string, address: string): string {
    return `BeanChain: vinculo la wallet ${getAddress(address)} a mi cuenta ${userId}`;
  }

  get(userId: string) {
    return this.prisma.wallet.findUnique({
      where: { userId },
      select: { address: true, custodial: true, onchainRegisteredAt: true, registryTxHash: true, createdAt: true },
    });
  }

  /** Crea una wallet custodiada si el usuario no tiene ninguna. */
  async ensureWallet(userId: string) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    const w = EthersWallet.createRandom();
    return this.prisma.wallet.create({
      data: {
        userId,
        address: w.address,
        custodial: true,
        encryptedKey: this.crypto.encrypt(w.privateKey),
      },
    });
  }

  /**
   * Vincula una wallet propia (no custodiada). Sólo se permite si el usuario
   * aún no tiene tokens emitidos: después hay que usar la recuperación de
   * wallet del token (recoveryAddress), que hace un agente.
   */
  async linkExternal(userId: string, address: string, signature: string) {
    let checksum: string;
    try {
      checksum = getAddress(address);
    } catch {
      throw new BadRequestException('Dirección no válida');
    }
    const signer = verifyMessage(WalletsService.linkMessage(userId, checksum), signature);
    if (getAddress(signer) !== checksum) throw new BadRequestException('La firma no corresponde a esa wallet');

    const taken = await this.prisma.wallet.findUnique({ where: { address: checksum } });
    if (taken && taken.userId !== userId) throw new ConflictException('Esa wallet ya está vinculada a otra cuenta');

    const issued = await this.prisma.investment.count({ where: { userId, status: 'TOKENS_ISSUED' } });
    if (issued > 0) {
      throw new ConflictException('Ya tienes tokens emitidos. Contacta con soporte para cambiar de wallet.');
    }

    const kyc = await this.prisma.kycVerification.findFirst({
      where: { userId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { country: true } } },
    });

    const previous = await this.prisma.wallet.findUnique({ where: { userId } });
    if (previous?.onchainRegisteredAt) await this.chain.removeIdentity(previous.address);

    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      create: { userId, address: checksum, custodial: false },
      update: { address: checksum, custodial: false, encryptedKey: null, onchainRegisteredAt: null, registryTxHash: null },
    });
    await this.audit.log({ actorId: userId, action: 'wallet.link_external', entity: 'Wallet', entityId: wallet.id, data: { address: checksum } });

    if (kyc) await this.registerOnChain(userId, kyc.user.country, kyc.expiresAt, kyc.id);
    return this.get(userId);
  }

  /** Inscribe la wallet del usuario en el IdentityRegistry. */
  async registerOnChain(userId: string, country: string, expiresAt: Date | null, kycRef: string) {
    const wallet = await this.ensureWallet(userId);
    const txHash = await this.chain.registerIdentity(wallet.address, country, expiresAt, kycRef);
    return this.prisma.wallet.update({
      where: { id: wallet.id },
      data: { onchainRegisteredAt: new Date(), registryTxHash: txHash },
    });
  }
}
