import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { AppConfig } from '../../config/app-config';
import { KycProvider, KycSessionResult, KycSubject, KycWebhookEvent } from '../kyc-provider';

const BASE_URL = 'https://api.sumsub.com';

/**
 * Integración con Sumsub (KYC + cribado AML/sanciones/PEP).
 * Docs: https://docs.sumsub.com/reference/about-sumsub-api
 */
@Injectable()
export class SumsubKycProvider implements KycProvider {
  readonly name = 'sumsub';

  constructor(private readonly config: AppConfig) {}

  async createSession(user: KycSubject): Promise<KycSessionResult> {
    const { sumsubAppToken, sumsubSecretKey, sumsubLevelName } = this.config.kyc;
    if (!sumsubAppToken || !sumsubSecretKey) {
      throw new ServiceUnavailableException('Sumsub no está configurado');
    }
    const path =
      `/resources/accessTokens?userId=${encodeURIComponent(user.id)}` +
      `&levelName=${encodeURIComponent(sumsubLevelName)}&ttlInSecs=1800`;
    const res = await this.request('POST', path);
    return { externalId: null, accessToken: res.token as string, mode: 'sdk' };
  }

  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): KycWebhookEvent {
    const secret = this.config.kyc.sumsubWebhookSecret;
    const digest = String(headers['x-payload-digest'] ?? '');
    const alg = String(headers['x-payload-digest-alg'] ?? 'HMAC_SHA256_HEX');
    const algo = alg === 'HMAC_SHA512_HEX' ? 'sha512' : alg === 'HMAC_SHA1_HEX' ? 'sha1' : 'sha256';
    const expected = createHmac(algo, secret).update(rawBody).digest('hex');
    if (!secret || !digest || digest.length !== expected.length || !timingSafeEqual(Buffer.from(digest), Buffer.from(expected))) {
      throw new UnauthorizedException('Firma de webhook no válida');
    }

    const body = JSON.parse(rawBody.toString('utf8'));
    const base = { externalId: body.applicantId ?? null, externalUserId: body.externalUserId ?? null, raw: body };

    if (body.type !== 'applicantReviewed') {
      return { ...base, decision: body.type === 'applicantPending' ? 'pending' : 'ignored' };
    }
    const answer = body.reviewResult?.reviewAnswer;
    const labels: string[] = body.reviewResult?.rejectLabels ?? [];
    return {
      ...base,
      decision: answer === 'GREEN' ? 'approved' : 'rejected',
      rejectReason: body.reviewResult?.moderationComment ?? (labels.join(', ') || undefined),
      sanctionsHit: labels.includes('SANCTIONS'),
      pepHit: labels.includes('PEP'),
    };
  }

  private async request(method: string, path: string, body?: unknown) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const payload = body ? JSON.stringify(body) : '';
    const sig = createHmac('sha256', this.config.kyc.sumsubSecretKey)
      .update(ts + method + path + payload)
      .digest('hex');
    const res = await fetch(BASE_URL + path, {
      method,
      headers: {
        'X-App-Token': this.config.kyc.sumsubAppToken,
        'X-App-Access-Ts': ts,
        'X-App-Access-Sig': sig,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: payload || undefined,
    });
    if (!res.ok) throw new ServiceUnavailableException(`Sumsub respondió ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }
}
