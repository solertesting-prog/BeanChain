import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Contract, ContractFactory, ethers, JsonRpcProvider, NonceManager, Wallet } from 'ethers';
import { randomBytes } from 'crypto';
import {
  DocumentRegistry as DocumentRegistryArtifact,
  HarvestCompliance as HarvestComplianceArtifact,
  HarvestToken as HarvestTokenArtifact,
  IdentityRegistry as IdentityRegistryArtifact,
} from '@beanchain/contracts';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { toIsoNumeric } from '../common/countries';
import { centsToTokenUnits } from '../common/money';

export interface DeployHarvestParams {
  name: string;
  symbol: string;
  harvestId: string;
  cap: number;
  blockedCountries: string[]; // ISO alfa-2
  maxHolders?: number | null;
  maxTokensPerInvestor?: number | null;
}

export interface DeployHarvestResult {
  tokenAddress: string;
  complianceAddress: string;
  txHash: string;
  chainId: number;
}

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

/**
 * Puente con la blockchain. Todas las operaciones las firma el operador de la
 * plataforma (rol AGENT en los contratos).
 *
 * En modo `simulated` no se toca ninguna red: se generan hashes y direcciones
 * ficticios y se registran igualmente en ChainTransaction. Sirve para
 * desarrollo de la interfaz y para los tests.
 */
@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly provider?: JsonRpcProvider;
  private readonly signer?: NonceManager;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {
    if (this.isLive) {
      this.provider = new JsonRpcProvider(config.blockchain.rpcUrl, config.blockchain.chainId);
      this.signer = new NonceManager(new Wallet(config.blockchain.operatorPrivateKey, this.provider));
    }
  }

  get isLive(): boolean {
    return this.config.blockchain.mode === 'live';
  }

  get chainId(): number {
    return this.config.blockchain.chainId;
  }

  explorerTxUrl(txHash?: string | null): string | null {
    if (!txHash || !this.isLive) return null;
    return `${this.config.blockchain.explorerUrl}/tx/${txHash}`;
  }

  explorerAddressUrl(address?: string | null): string | null {
    if (!address || !this.isLive) return null;
    return `${this.config.blockchain.explorerUrl}/address/${address}`;
  }

  // ---------------------------------------------------------------------
  // Identidades
  // ---------------------------------------------------------------------

  async registerIdentity(wallet: string, countryAlpha2: string, expiresAt: Date | null, kycRef: string) {
    return this.run('identity.register', wallet, async () => {
      const registry = this.contract(this.config.blockchain.identityRegistry, IdentityRegistryArtifact.abi);
      const country = toIsoNumeric(countryAlpha2);
      const expiry = expiresAt ? Math.floor(expiresAt.getTime() / 1000) : 0;
      const ref = ethers.id(kycRef);
      if (await registry.contains(wallet)) {
        return registry.updateIdentity(wallet, country, expiry);
      }
      return registry.registerIdentity(wallet, country, expiry, ref);
    });
  }

  async removeIdentity(wallet: string) {
    return this.run('identity.remove', wallet, async () => {
      const registry = this.contract(this.config.blockchain.identityRegistry, IdentityRegistryArtifact.abi);
      return registry.deleteIdentity(wallet);
    });
  }

  // ---------------------------------------------------------------------
  // Tokens de cosecha
  // ---------------------------------------------------------------------

  async deployHarvestToken(p: DeployHarvestParams): Promise<DeployHarvestResult> {
    if (!this.isLive) {
      const txHash = this.fakeHash();
      await this.record('token.deploy', p.harvestId, txHash, 'SIMULATED');
      return {
        tokenAddress: Wallet.createRandom().address,
        complianceAddress: Wallet.createRandom().address,
        txHash,
        chainId: this.chainId,
      };
    }

    return this.serialize(async () => {
      try {
        const signer = this.requireSigner();
        const operator = await signer.getAddress();
        const maxBalance = p.maxTokensPerInvestor ?? 0;

        const complianceFactory = new ContractFactory(
          HarvestComplianceArtifact.abi,
          HarvestComplianceArtifact.bytecode,
          signer,
        );
        const compliance = await complianceFactory.deploy(
          operator,
          this.config.blockchain.identityRegistry,
          maxBalance,
          p.maxHolders ?? 0,
        );
        await compliance.waitForDeployment();
        const complianceAddress = await compliance.getAddress();

        const tokenFactory = new ContractFactory(HarvestTokenArtifact.abi, HarvestTokenArtifact.bytecode, signer);
        const token = await tokenFactory.deploy(
          p.name,
          p.symbol,
          p.harvestId,
          p.cap,
          this.config.blockchain.paymentToken,
          this.config.blockchain.identityRegistry,
          complianceAddress,
          operator,
        );
        await token.waitForDeployment();
        const tokenAddress = await token.getAddress();
        const deployTx = token.deploymentTransaction();

        const complianceContract = this.contract(complianceAddress, HarvestComplianceArtifact.abi);
        await (await complianceContract.bindToken(tokenAddress)).wait();

        const blocked = p.blockedCountries.map(toIsoNumeric);
        if (blocked.length > 0) {
          await (await complianceContract.batchSetCountryBlocked(blocked, true)).wait();
        }

        const txHash = deployTx?.hash ?? this.fakeHash();
        await this.record('token.deploy', p.harvestId, txHash, 'CONFIRMED');
        return { tokenAddress, complianceAddress, txHash, chainId: this.chainId };
      } catch (err) {
        await this.record('token.deploy', p.harvestId, null, 'FAILED', err);
        throw this.wrap(err);
      }
    });
  }

  async mint(tokenAddress: string, to: string, amount: number, reference: string) {
    return this.run('token.mint', reference, () =>
      this.contract(tokenAddress, HarvestTokenArtifact.abi).mint(to, amount),
    );
  }

  async burn(tokenAddress: string, from: string, amount: number, reference: string) {
    return this.run('token.burn', reference, () =>
      this.contract(tokenAddress, HarvestTokenArtifact.abi).burn(from, amount),
    );
  }

  async closeToken(tokenAddress: string, reference: string) {
    return this.run('token.close', reference, () => this.contract(tokenAddress, HarvestTokenArtifact.abi).close());
  }

  /**
   * Deposita el reparto en el contrato. El operador debe tener saldo
   * suficiente del stablecoin (procedente de la venta de la cosecha).
   */
  async distribute(tokenAddress: string, amountCents: number, reference: string) {
    const units = centsToTokenUnits(amountCents, this.config.blockchain.paymentTokenDecimals);
    if (this.isLive) {
      await this.serialize(async () => {
        const stable = this.contract(this.config.blockchain.paymentToken, ERC20_ABI);
        const operator = await this.requireSigner().getAddress();
        const balance: bigint = await stable.balanceOf(operator);
        if (balance < units) {
          throw new ServiceUnavailableException(
            'El operador no tiene saldo suficiente de stablecoin para este reparto',
          );
        }
        const allowance: bigint = await stable.allowance(operator, tokenAddress);
        if (allowance < units) {
          await (await stable.approve(tokenAddress, units)).wait();
        }
      });
    }
    return this.run('token.distribute', reference, () =>
      this.contract(tokenAddress, HarvestTokenArtifact.abi).distribute(units),
    );
  }

  async claimFor(tokenAddress: string, wallets: string[], reference: string) {
    return this.run('token.claimFor', reference, () =>
      this.contract(tokenAddress, HarvestTokenArtifact.abi).batchClaimFor(wallets),
    );
  }

  async tokenBalance(tokenAddress: string, wallet: string): Promise<number | null> {
    if (!this.isLive) return null;
    const bal: bigint = await this.contract(tokenAddress, HarvestTokenArtifact.abi).balanceOf(wallet);
    return Number(bal);
  }

  // ---------------------------------------------------------------------
  // Documentos
  // ---------------------------------------------------------------------

  async anchorDocument(sha256Hex: string, subjectId: string, docType: string, uri: string) {
    return this.run('document.anchor', sha256Hex, () =>
      this.contract(this.config.blockchain.documentRegistry, DocumentRegistryArtifact.abi).anchor(
        '0x' + sha256Hex,
        ethers.id(subjectId),
        docType,
        uri,
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  /** Ejecuta una transacción, espera confirmación y la registra. Devuelve el hash. */
  private async run(
    kind: string,
    reference: string,
    send: () => Promise<ethers.ContractTransactionResponse>,
  ): Promise<string> {
    if (!this.isLive) {
      const hash = this.fakeHash();
      await this.record(kind, reference, hash, 'SIMULATED');
      return hash;
    }
    return this.serialize(async () => {
      try {
        const tx = await send();
        await this.record(kind, reference, tx.hash, 'SUBMITTED');
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error(`La transacción ${tx.hash} ha fallado`);
        await this.prisma.chainTransaction.updateMany({
          where: { txHash: tx.hash },
          data: { status: 'CONFIRMED' },
        });
        return tx.hash;
      } catch (err) {
        await this.record(kind, reference, null, 'FAILED', err);
        throw this.wrap(err);
      }
    });
  }

  /** Serializa las transacciones del operador para evitar conflictos de nonce. */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private contract(address: string, abi: ethers.InterfaceAbi): Contract {
    return new Contract(address, abi, this.requireSigner());
  }

  private requireSigner(): NonceManager {
    if (!this.signer) throw new ServiceUnavailableException('Blockchain no configurada (BLOCKCHAIN_MODE=simulated)');
    return this.signer;
  }

  private async record(
    kind: string,
    reference: string | null,
    txHash: string | null,
    status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'SIMULATED',
    err?: unknown,
  ) {
    try {
      await this.prisma.chainTransaction.create({
        data: { kind, reference, txHash, status, error: err ? String((err as Error).message ?? err).slice(0, 1000) : null },
      });
    } catch (e) {
      this.logger.warn(`No se pudo registrar la transacción ${kind}: ${(e as Error).message}`);
    }
  }

  private wrap(err: unknown): Error {
    const e = err as { shortMessage?: string; message?: string };
    this.logger.error(`Error de blockchain: ${e.shortMessage ?? e.message}`);
    return new ServiceUnavailableException(`Error de blockchain: ${e.shortMessage ?? e.message ?? 'desconocido'}`);
  }

  private fakeHash(): string {
    return '0x' + randomBytes(32).toString('hex');
  }
}
