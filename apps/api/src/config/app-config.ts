import { Injectable } from '@nestjs/common';

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`${name} debe ser un número entero`);
  return n;
}

function list(name: string, fallback = ''): string[] {
  return str(name, fallback)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Configuración tipada de la aplicación. Se valida al arrancar: si falta algo
 * imprescindible en producción, la API no arranca.
 */
@Injectable()
export class AppConfig {
  readonly nodeEnv = str('NODE_ENV', 'development');
  readonly isProduction = this.nodeEnv === 'production';
  readonly isTest = this.nodeEnv === 'test';
  readonly port = int('PORT', 4000);
  readonly appUrl = str('APP_URL', 'http://localhost:3000');
  readonly apiUrl = str('API_URL', 'http://localhost:4000');
  readonly corsOrigins = str('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  readonly jwt = {
    accessSecret: str('JWT_ACCESS_SECRET', this.isProduction ? undefined : 'dev-access-secret'),
    refreshSecret: str('JWT_REFRESH_SECRET', this.isProduction ? undefined : 'dev-refresh-secret'),
    accessTtlSeconds: int('JWT_ACCESS_TTL', 900),
    refreshTtlDays: int('JWT_REFRESH_TTL_DAYS', 30),
  };

  readonly encryptionKeyHex = str(
    'APP_ENCRYPTION_KEY',
    this.isProduction ? undefined : '0'.repeat(64),
  );

  readonly blockchain = {
    mode: str('BLOCKCHAIN_MODE', 'simulated') as 'simulated' | 'live',
    rpcUrl: str('RPC_URL', 'http://127.0.0.1:8545'),
    chainId: int('CHAIN_ID', 31337),
    operatorPrivateKey: process.env.OPERATOR_PRIVATE_KEY ?? '',
    identityRegistry: process.env.IDENTITY_REGISTRY_ADDRESS ?? '',
    documentRegistry: process.env.DOCUMENT_REGISTRY_ADDRESS ?? '',
    paymentToken: process.env.PAYMENT_TOKEN_ADDRESS ?? '',
    paymentTokenDecimals: int('PAYMENT_TOKEN_DECIMALS', 6),
    explorerUrl: str('EXPLORER_URL', 'https://amoy.polygonscan.com'),
  };

  readonly compliance = {
    globalBlockedCountries: list('GLOBAL_BLOCKED_COUNTRIES', 'KP,IR,SY,CU,RU,BY'),
    kycValidityDays: int('KYC_VALIDITY_DAYS', 365),
    retailSoftLimitCents: int('RETAIL_SOFT_LIMIT_CENTS', 100_000),
  };

  readonly kyc = {
    provider: str('KYC_PROVIDER', 'mock'),
    sumsubAppToken: process.env.SUMSUB_APP_TOKEN ?? '',
    sumsubSecretKey: process.env.SUMSUB_SECRET_KEY ?? '',
    sumsubWebhookSecret: process.env.SUMSUB_WEBHOOK_SECRET ?? '',
    sumsubLevelName: str('SUMSUB_LEVEL_NAME', 'basic-kyc-level'),
  };

  readonly payments = {
    iban: str('BANK_IBAN', 'ES00 0000 0000 0000 0000 0000'),
    beneficiary: str('BANK_BENEFICIARY', 'BeanChain Emisora S.L.'),
    bic: str('BANK_BIC', 'XXXXESMMXXX'),
    reservationHours: int('PAYMENT_RESERVATION_HOURS', 72),
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  };

  readonly storage = {
    driver: str('STORAGE_DRIVER', 'local') as 'local' | 's3',
    localDir: str('STORAGE_LOCAL_DIR', './uploads'),
    s3Bucket: process.env.S3_BUCKET ?? '',
    s3Region: str('S3_REGION', 'eu-west-1'),
    s3Endpoint: process.env.S3_ENDPOINT || undefined,
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  };

  readonly mail = {
    driver: str('MAIL_DRIVER', 'console') as 'console' | 'smtp',
    from: str('MAIL_FROM', 'BeanChain <no-reply@beanchain.example>'),
    smtpHost: process.env.SMTP_HOST ?? '',
    smtpPort: int('SMTP_PORT', 587),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
  };

  constructor() {
    if (!/^[0-9a-fA-F]{64}$/.test(this.encryptionKeyHex)) {
      throw new Error('APP_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales (32 bytes)');
    }
    if (this.isProduction && /^0+$/.test(this.encryptionKeyHex)) {
      throw new Error('APP_ENCRYPTION_KEY no puede ser la clave de ejemplo en producción');
    }
    if (this.blockchain.mode === 'live') {
      for (const [k, v] of Object.entries({
        OPERATOR_PRIVATE_KEY: this.blockchain.operatorPrivateKey,
        IDENTITY_REGISTRY_ADDRESS: this.blockchain.identityRegistry,
        DOCUMENT_REGISTRY_ADDRESS: this.blockchain.documentRegistry,
        PAYMENT_TOKEN_ADDRESS: this.blockchain.paymentToken,
      })) {
        if (!v) throw new Error(`BLOCKCHAIN_MODE=live requiere ${k}`);
      }
    }
  }
}
