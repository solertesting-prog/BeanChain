import { Injectable } from '@nestjs/common';
import { KycProvider, KycSessionResult, KycSubject, KycWebhookEvent } from '../kyc-provider';

/**
 * Proveedor de pruebas: el usuario envía sus datos desde la web y un
 * administrador aprueba o rechaza desde el backoffice. No usar en producción.
 */
@Injectable()
export class MockKycProvider implements KycProvider {
  readonly name = 'mock';

  async createSession(user: KycSubject): Promise<KycSessionResult> {
    return { externalId: `mock_${user.id}_${Date.now()}`, mode: 'mock' };
  }

  parseWebhook(_headers: Record<string, string | string[] | undefined>, rawBody: Buffer): KycWebhookEvent {
    const body = JSON.parse(rawBody.toString('utf8') || '{}');
    return {
      externalId: body.externalId ?? null,
      externalUserId: body.userId ?? null,
      decision: body.decision ?? 'ignored',
      rejectReason: body.reason,
      raw: body,
    };
  }
}
