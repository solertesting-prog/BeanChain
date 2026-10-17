/**
 * Reglas de elegibilidad de una inversión, como función pura para poder
 * testearlas sin base de datos.
 */
export interface InvestmentRuleInput {
  now: Date;
  tokens: number;
  kycApproved: boolean;
  investorCountry: string;
  investorCategory: 'RETAIL' | 'PROFESSIONAL';
  riskAcknowledged: boolean;
  acknowledgeRetailLimit?: boolean;
  netWorthCents?: number;
  heldOrReservedTokens: number;
  availableTokens: number;
  retailSoftLimitCents: number;
  opportunity: {
    status: string;
    opensAt: Date | null;
    closesAt: Date | null;
    tokenPriceCents: number;
    minTokens: number;
    maxTokensPerInvestor: number | null;
    blockedCountries: string[];
    tokenAddress: string | null;
  };
}

export type RuleCode =
  | 'KYC_REQUIRED'
  | 'COUNTRY_BLOCKED'
  | 'NOT_OPEN'
  | 'CLOSED'
  | 'BELOW_MIN'
  | 'ABOVE_MAX'
  | 'SOLD_OUT'
  | 'RISK_NOT_ACKNOWLEDGED'
  | 'RETAIL_LIMIT_ACK_REQUIRED'
  | 'TOKEN_NOT_DEPLOYED';

export interface RuleResult {
  ok: boolean;
  code?: RuleCode;
  message?: string;
  amountCents: number;
  retailWarning: boolean;
}

export function evaluateInvestment(i: InvestmentRuleInput): RuleResult {
  const o = i.opportunity;
  const amountCents = i.tokens * o.tokenPriceCents;
  const fail = (code: RuleCode, message: string): RuleResult => ({ ok: false, code, message, amountCents, retailWarning: false });

  if (!i.kycApproved) return fail('KYC_REQUIRED', 'Necesitas verificar tu identidad antes de invertir');
  if (o.blockedCountries.map((c) => c.toUpperCase()).includes(i.investorCountry.toUpperCase())) {
    return fail('COUNTRY_BLOCKED', 'Esta oportunidad no está disponible para residentes en tu país');
  }
  if (o.status !== 'PUBLISHED' || (o.opensAt && o.opensAt > i.now)) {
    return fail('NOT_OPEN', 'La captación no está abierta');
  }
  if (o.closesAt && o.closesAt <= i.now) return fail('CLOSED', 'La captación ya ha cerrado');
  if (!o.tokenAddress) return fail('TOKEN_NOT_DEPLOYED', 'El token de esta cosecha aún no está emitido');
  if (i.tokens < o.minTokens) return fail('BELOW_MIN', `La inversión mínima es de ${o.minTokens} tokens`);
  if (o.maxTokensPerInvestor && i.heldOrReservedTokens + i.tokens > o.maxTokensPerInvestor) {
    const left = Math.max(0, o.maxTokensPerInvestor - i.heldOrReservedTokens);
    return fail('ABOVE_MAX', `Puedes adquirir como máximo ${left} tokens más en esta cosecha`);
  }
  if (i.tokens > i.availableTokens) {
    return fail('SOLD_OUT', i.availableTokens > 0 ? `Sólo quedan ${i.availableTokens} tokens` : 'No quedan tokens disponibles');
  }
  if (!i.riskAcknowledged) return fail('RISK_NOT_ACKNOWLEDGED', 'Debes confirmar que has leído los riesgos');

  // Reglamento (UE) 2020/1503, art. 21.7: aviso a minoristas que invierten
  // más de 1.000 € o del 5 % de su patrimonio en un solo proyecto.
  let retailWarning = false;
  if (i.investorCategory === 'RETAIL') {
    const overSoft = amountCents > i.retailSoftLimitCents;
    const overNetWorth = i.netWorthCents !== undefined ? amountCents > i.netWorthCents * 0.05 : false;
    retailWarning = overSoft || overNetWorth;
    if (retailWarning && !i.acknowledgeRetailLimit) {
      return {
        ...fail(
          'RETAIL_LIMIT_ACK_REQUIRED',
          'Vas a invertir más de 1.000 € o del 5 % de tu patrimonio. Confirma expresamente que entiendes el riesgo.',
        ),
        retailWarning: true,
      };
    }
  }

  return { ok: true, amountCents, retailWarning };
}
