import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';
import { AppConfig } from '../config/app-config';

/**
 * Cifrado simétrico AES-256-GCM para secretos guardados en base de datos
 * (semillas MFA, claves de wallets custodiadas).
 *
 * Formato: v1.<iv base64>.<tag base64>.<datos base64>
 *
 * IMPORTANTE: en producción las claves privadas de wallets deberían vivir en un
 * KMS/HSM o en un custodio MPC (Fireblocks, Dfns, Privy…). Este cifrado es
 * una capa mínima para desarrollo y pilotos.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    this.key = Buffer.from(config.encryptionKeyHex, 'hex');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join('.');
  }

  decrypt(payload: string): string {
    const [version, ivB64, tagB64, dataB64] = payload.split('.');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
      throw new Error('Formato de dato cifrado no reconocido');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  }

  sha256Hex(input: string | Buffer): string {
    return createHash('sha256').update(input).digest('hex');
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }
}
