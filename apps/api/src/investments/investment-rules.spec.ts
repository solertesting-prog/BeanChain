import { evaluateInvestment, InvestmentRuleInput } from './investment-rules';

const now = new Date('2027-01-15T10:00:00Z');

function input(overrides: Partial<InvestmentRuleInput> = {}, opp: Partial<InvestmentRuleInput['opportunity']> = {}): InvestmentRuleInput {
  return {
    now,
    tokens: 5,
    kycApproved: true,
    investorCountry: 'ES',
    investorCategory: 'RETAIL',
    riskAcknowledged: true,
    heldOrReservedTokens: 0,
    availableTokens: 100,
    retailSoftLimitCents: 100_000,
    ...overrides,
    opportunity: {
      status: 'PUBLISHED',
      opensAt: new Date('2027-01-01T00:00:00Z'),
      closesAt: new Date('2027-02-01T00:00:00Z'),
      tokenPriceCents: 10_000,
      minTokens: 1,
      maxTokensPerInvestor: 50,
      blockedCountries: ['US'],
      tokenAddress: '0x0000000000000000000000000000000000000001',
      ...opp,
    },
  };
}

describe('evaluateInvestment', () => {
  it('acepta una inversión válida', () => {
    const r = evaluateInvestment(input());
    expect(r).toEqual({ ok: true, amountCents: 50_000, retailWarning: false });
  });

  it.each([
    ['KYC_REQUIRED', input({ kycApproved: false })],
    ['COUNTRY_BLOCKED', input({ investorCountry: 'us' })],
    ['NOT_OPEN', input({}, { status: 'DRAFT' })],
    ['NOT_OPEN', input({}, { opensAt: new Date('2027-03-01T00:00:00Z') })],
    ['CLOSED', input({}, { closesAt: new Date('2027-01-10T00:00:00Z') })],
    ['TOKEN_NOT_DEPLOYED', input({}, { tokenAddress: null })],
    ['BELOW_MIN', input({ tokens: 1 }, { minTokens: 2 })],
    ['ABOVE_MAX', input({ tokens: 10, heldOrReservedTokens: 45 })],
    ['SOLD_OUT', input({ tokens: 5, availableTokens: 4 })],
    ['RISK_NOT_ACKNOWLEDGED', input({ riskAcknowledged: false })],
  ])('rechaza con %s', (code, i) => {
    const r = evaluateInvestment(i);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(code);
  });

  it('pide confirmación expresa a minoristas por encima de 1.000 €', () => {
    const r = evaluateInvestment(input({ tokens: 20 }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('RETAIL_LIMIT_ACK_REQUIRED');
    expect(r.retailWarning).toBe(true);

    const ok = evaluateInvestment(input({ tokens: 20, acknowledgeRetailLimit: true }));
    expect(ok).toEqual({ ok: true, amountCents: 200_000, retailWarning: true });
  });

  it('aplica el 5 % del patrimonio declarado', () => {
    const r = evaluateInvestment(input({ tokens: 5, netWorthCents: 500_000 }));
    expect(r.code).toBe('RETAIL_LIMIT_ACK_REQUIRED');
  });

  it('no limita a inversores profesionales', () => {
    const r = evaluateInvestment(input({ tokens: 40, investorCategory: 'PROFESSIONAL' }));
    expect(r.ok).toBe(true);
  });
});
