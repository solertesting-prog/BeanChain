/**
 * Contrato genérico para proveedores de verificación de identidad (KYC/AML).
 * Añadir un proveedor nuevo (Onfido, Veriff, Persona…) = implementar esta
 * interfaz y registrarlo en KycModule.
 */
export interface KycSessionResult {
  externalId: string | null;
  /** Token o URL que la web usa para lanzar el flujo del proveedor. */
  accessToken?: string;
  url?: string;
  mode: 'mock' | 'sdk' | 'redirect';
}

export interface KycWebhookEvent {
  externalId: string | null;
  externalUserId: string | null;
  decision: 'approved' | 'rejected' | 'pending' | 'ignored';
  rejectReason?: string;
  sanctionsHit?: boolean;
  pepHit?: boolean;
  raw: unknown;
}

export interface KycSubject {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  country: string;
}

export interface KycProvider {
  readonly name: string;
  createSession(user: KycSubject): Promise<KycSessionResult>;
  /** Verifica la firma del webhook y lo traduce. Lanza si la firma no es válida. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): KycWebhookEvent;
}

export const KYC_PROVIDERS = Symbol('KYC_PROVIDERS');
