import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { AppConfig } from '../config/app-config';

export interface CheckoutParams {
  investmentId: string;
  reference: string;
  amountCents: number;
  description: string;
  customerEmail: string;
}

/**
 * Cliente mínimo de Stripe Checkout por REST (sin SDK) para pagos con tarjeta.
 * Ojo: muchas plataformas reguladas exigen que los fondos pasen por una
 * entidad de pago autorizada o una cuenta de garantía (escrow).
 */
@Injectable()
export class StripeClient {
  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.payments.stripeSecretKey);
  }

  async createCheckout(p: CheckoutParams): Promise<{ id: string; url: string }> {
    if (!this.enabled) throw new ServiceUnavailableException('El pago con tarjeta no está disponible');
    const form = new URLSearchParams({
      mode: 'payment',
      'payment_method_types[0]': 'card',
      customer_email: p.customerEmail,
      client_reference_id: p.investmentId,
      'metadata[investmentId]': p.investmentId,
      'metadata[reference]': p.reference,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(p.amountCents),
      'line_items[0][price_data][product_data][name]': p.description,
      success_url: `${this.config.appUrl}/cartera?pago=ok&ref=${encodeURIComponent(p.reference)}`,
      cancel_url: `${this.config.appUrl}/cartera?pago=cancelado&ref=${encodeURIComponent(p.reference)}`,
    });
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.payments.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `checkout-${p.investmentId}`,
      },
      body: form,
    });
    if (!res.ok) throw new ServiceUnavailableException(`Stripe respondió ${res.status}`);
    const json = (await res.json()) as { id: string; url: string };
    return { id: json.id, url: json.url };
  }

  /** Verifica la cabecera Stripe-Signature y devuelve el evento. */
  verifyWebhook(signatureHeader: string | undefined, rawBody: Buffer, toleranceSec = 300): any {
    const secret = this.config.payments.stripeWebhookSecret;
    if (!secret || !signatureHeader) throw new UnauthorizedException('Firma de Stripe ausente');
    const parts = Object.fromEntries(
      signatureHeader.split(',').map((kv) => {
        const [k, ...v] = kv.split('=');
        return [k.trim(), v.join('=')];
      }),
    ) as Record<string, string>;
    const t = Number(parts.t);
    if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) throw new UnauthorizedException('Firma de Stripe caducada');
    const expected = createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
    const given = parts.v1 ?? '';
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new UnauthorizedException('Firma de Stripe no válida');
    }
    return JSON.parse(rawBody.toString('utf8'));
  }
}
