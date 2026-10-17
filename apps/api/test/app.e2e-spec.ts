/**
 * Recorrido completo en modo blockchain simulado:
 * admin crea finca y oportunidad → sube documentos → publica (despliega token)
 * → inversor se registra, verifica KYC, reserva y paga → recibe tokens →
 * novedades de cosecha → reparto → cartera.
 *
 * Necesita PostgreSQL (DATABASE_URL) con el esquema aplicado (`prisma db push`).
 */
process.env.NODE_ENV = 'test';
// E2E_BLOCKCHAIN_MODE=live ejecuta el recorrido contra una red real (p. ej. `hardhat node`)
// con los contratos desplegados y comprueba los saldos on-chain.
const CHAIN_MODE = process.env.E2E_BLOCKCHAIN_MODE === 'live' ? 'live' : 'simulated';
process.env.BLOCKCHAIN_MODE = CHAIN_MODE;
process.env.KYC_PROVIDER = 'mock';
process.env.MAIL_DRIVER = 'console';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = require('path').join(require('os').tmpdir(), `beanchain-e2e-${Date.now()}`);

import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';
import { Contract, JsonRpcProvider } from 'ethers';

const live = CHAIN_MODE === 'live';
const itLive = live ? it : it.skip;
const ERC20 = ['function balanceOf(address) view returns (uint256)'];
const IDENTITY = ['function isVerified(address) view returns (bool)', 'function investorCountry(address) view returns (uint16)'];
const DOCS = ['function isAnchored(bytes32) view returns (bool)'];

describe('BeanChain (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  const run = Date.now().toString(36);
  const adminEmail = `admin-${run}@test.local`;
  const investorEmail = `inversor-${run}@test.local`;
  const password = 'Contrasena123';
  let adminToken = '';
  let investorToken = '';
  let farmId = '';
  let opportunityId = '';
  let opportunitySlug = '';
  let investmentId = '';
  let amountCents = 0;
  let agronomyHash = '';
  let tokenAddress = '';
  let investorWallet = '';
  const provider = live ? new JsonRpcProvider(process.env.RPC_URL ?? 'http://127.0.0.1:8545') : null;

  const api = (path: string) => `/v1${path}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(password, 4),
        firstName: 'Ada',
        lastName: 'Admin',
        country: 'ES',
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('responde al health check', async () => {
    const res = await http.get('/health').expect(200);
    expect(res.body).toMatchObject({ ok: true, blockchain: CHAIN_MODE });
  });

  it('el administrador inicia sesión', async () => {
    const res = await http.post(api('/auth/login')).send({ email: adminEmail, password }).expect(200);
    expect(res.body.accessToken).toBeDefined();
    adminToken = res.body.accessToken;
  });

  it('rechaza rutas de administración a anónimos', async () => {
    await http.get(api('/admin/stats')).expect(401);
  });

  it('crea una finca y registra la revisión de sanciones', async () => {
    const res = await http
      .post(api('/admin/farms'))
      .set(auth(adminToken))
      .send({
        name: `Finca Test ${run}`,
        crop: 'CACAO',
        varieties: ['Trinitario'],
        country: 'VE',
        region: 'Sucre',
        hectares: 12.5,
        description: 'Finca de pruebas para el recorrido e2e.',
        ownerName: 'Cooperativa de pruebas',
        productionHistory: [{ year: 2025, kg: 8000 }],
      })
      .expect(201);
    farmId = res.body.id;

    await http
      .post(api(`/admin/farms/${farmId}/sanctions-check`))
      .set(auth(adminToken))
      .send({ clear: true, note: 'Sin coincidencias en OFAC SDN ni listas UE' })
      .expect(201);
  });

  it('crea la oportunidad en borrador', async () => {
    const res = await http
      .post(api('/admin/opportunities'))
      .set(auth(adminToken))
      .send({
        farmId,
        title: 'Cosecha de pruebas 2027',
        summary: 'Prefinanciación de una cosecha de pruebas.',
        description: 'Descripción suficientemente larga de la oportunidad de pruebas.',
        harvestYear: 2027,
        tokenPriceCents: 10_000,
        totalTokens: 100,
        maxTokensPerInvestor: 20,
        expectedReturnBps: 1200,
        termMonths: 12,
        risks: ['Clima'],
        closesAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        expectedPayoutAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
        blockedCountries: ['US'],
        tokenSymbol: `T-${run.toUpperCase()}`.slice(0, 16),
      })
      .expect(201);
    opportunityId = res.body.id;
    opportunitySlug = res.body.slug;
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.targetAmountCents).toBe(1_000_000);
  });

  it('no publica sin la documentación obligatoria', async () => {
    const res = await http.post(api(`/admin/opportunities/${opportunityId}/publish`)).set(auth(adminToken)).expect(400);
    expect(res.body.checklist.ready).toBe(false);
  });

  it('sube los documentos y los ancla', async () => {
    const docs = [
      ['CONTRACT', 'Contrato de prefinanciación', 'PUBLIC'],
      ['KEY_INFO_SHEET', 'Ficha de datos fundamentales', 'PUBLIC'],
      ['AGRONOMY_REPORT', 'Informe agronómico', 'INVESTORS'],
      ['BUYER_LETTER', 'Carta del comprador', 'INVESTORS'],
    ] as const;
    for (const [type, title, visibility] of docs) {
      const content = Buffer.from(`%PDF-1.4 ${type} ${run}`);
      const res = await http
        .post(api('/admin/documents'))
        .set(auth(adminToken))
        .field('type', type)
        .field('title', title)
        .field('visibility', visibility)
        .field('opportunityId', opportunityId)
        .attach('file', content, { filename: `${type}.pdf`, contentType: 'application/pdf' })
        .expect(201);
      expect(res.body.anchoredTxHash).toMatch(/^0x[0-9a-f]{64}$/);
      if (type === 'AGRONOMY_REPORT') {
        agronomyHash = createHash('sha256').update(content).digest('hex');
        expect(res.body.sha256).toBe(agronomyHash);
      }
    }
  });

  it('publica y despliega el token', async () => {
    const res = await http.post(api(`/admin/opportunities/${opportunityId}/publish`)).set(auth(adminToken)).expect(200);
    expect(res.body.status).toBe('PUBLISHED');
    expect(res.body.tokenAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    tokenAddress = res.body.tokenAddress;
  });

  itLive('el token existe on-chain con su emisión máxima y 0 decimales', async () => {
    expect(await provider!.getCode(tokenAddress)).not.toBe('0x');
    const token = new Contract(
      tokenAddress,
      ['function cap() view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
      provider!,
    );
    expect(await token.cap()).toBe(100n);
    expect(await token.decimals()).toBe(0n);
    expect(await token.symbol()).toBe(`T-${run.toUpperCase()}`.slice(0, 16));
  });

  itLive('el informe agronómico está anclado en el DocumentRegistry', async () => {
    const docs = new Contract(process.env.DOCUMENT_REGISTRY_ADDRESS!, DOCS, provider!);
    expect(await docs.isAnchored('0x' + agronomyHash)).toBe(true);
  });

  it('la oportunidad aparece en el escaparate público', async () => {
    const list = await http.get(api('/opportunities')).expect(200);
    expect(list.body.some((o: { id: string }) => o.id === opportunityId)).toBe(true);

    const detail = await http.get(api(`/opportunities/${opportunitySlug}`)).expect(200);
    expect(detail.body.token.standard).toBe('ERC-3643');
    // Un anónimo sólo ve los documentos públicos.
    expect(detail.body.documents).toHaveLength(2);
    expect(detail.body.blockedCountries).toEqual(expect.arrayContaining(['US', 'KP']));
  });

  it('rechaza registros desde países bloqueados', async () => {
    await http
      .post(api('/auth/register'))
      .send({ email: `kp-${run}@test.local`, password, firstName: 'X', lastName: 'Y', country: 'KP', acceptTerms: true })
      .expect(403);
  });

  it('registra al inversor', async () => {
    const res = await http
      .post(api('/auth/register'))
      .send({ email: investorEmail, password, firstName: 'Iván', lastName: 'Inversor', country: 'ES', acceptTerms: true })
      .expect(201);
    investorToken = res.body.accessToken;
    const me = await http.get(api('/auth/me')).set(auth(investorToken)).expect(200);
    expect(me.body.kyc.status).toBe('NOT_STARTED');
    await http.get(api('/admin/stats')).set(auth(investorToken)).expect(403);
  });

  it('no deja invertir sin KYC', async () => {
    const res = await http
      .post(api('/investments'))
      .set(auth(investorToken))
      .send({ opportunityId, tokens: 5, paymentMethod: 'BANK_TRANSFER', riskAcknowledged: true })
      .expect(400);
    expect(res.body.code).toBe('KYC_REQUIRED');
  });

  it('completa el KYC y registra la wallet on-chain', async () => {
    await http.post(api('/kyc/start')).set(auth(investorToken)).expect(201);
    await http
      .post(api('/kyc/mock/submit'))
      .set(auth(investorToken))
      .send({ nationality: 'ES', dateOfBirth: '1990-05-01', isPep: false, sourceOfFunds: 'Ahorros' })
      .expect(201);

    const pending = await http.get(api('/admin/kyc?status=PENDING')).set(auth(adminToken)).expect(200);
    const mine = pending.body.find((k: { user: { email: string } }) => k.user.email === investorEmail);
    expect(mine).toBeDefined();

    await http.post(api(`/admin/kyc/${mine.id}/review`)).set(auth(adminToken)).send({ approve: true }).expect(200);

    const me = await http.get(api('/auth/me')).set(auth(investorToken)).expect(200);
    expect(me.body.kyc.status).toBe('APPROVED');
    expect(me.body.wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(me.body.wallet.onchainRegisteredAt).toBeTruthy();
    investorWallet = me.body.wallet.address;
  });

  itLive('la wallet del inversor queda verificada en el IdentityRegistry', async () => {
    const registry = new Contract(process.env.IDENTITY_REGISTRY_ADDRESS!, IDENTITY, provider!);
    expect(await registry.isVerified(investorWallet)).toBe(true);
    expect(await registry.investorCountry(investorWallet)).toBe(724n);
  });

  it('un inversor con KYC ve los documentos para inversores', async () => {
    const detail = await http.get(api(`/opportunities/${opportunitySlug}`)).set(auth(investorToken)).expect(200);
    expect(detail.body.documents.length).toBeGreaterThanOrEqual(2);
    const agronomy = detail.body.documents.find((d: { type: string }) => d.type === 'AGRONOMY_REPORT');
    await http.get(api(`/documents/${agronomy.id}/download`)).set(auth(investorToken)).expect(200);
    await http.get(api(`/documents/${agronomy.id}/download`)).expect(403);
  });

  it('respeta el máximo por inversor y el aviso a minoristas', async () => {
    const above = await http
      .post(api('/investments/quote'))
      .set(auth(investorToken))
      .send({ opportunityId, tokens: 25, paymentMethod: 'BANK_TRANSFER', riskAcknowledged: true })
      .expect(200);
    expect(above.body.code).toBe('ABOVE_MAX');

    const retail = await http
      .post(api('/investments/quote'))
      .set(auth(investorToken))
      .send({ opportunityId, tokens: 15, paymentMethod: 'BANK_TRANSFER', riskAcknowledged: true })
      .expect(200);
    expect(retail.body.code).toBe('RETAIL_LIMIT_ACK_REQUIRED');
  });

  it('reserva tokens con transferencia bancaria', async () => {
    const res = await http
      .post(api('/investments'))
      .set(auth(investorToken))
      .send({ opportunityId, tokens: 5, paymentMethod: 'BANK_TRANSFER', riskAcknowledged: true })
      .expect(201);
    investmentId = res.body.id;
    amountCents = res.body.amountCents;
    expect(amountCents).toBe(50_000);
    expect(res.body.status).toBe('PENDING_PAYMENT');
    expect(res.body.paymentInstructions.reference).toMatch(/^BC-[A-Z0-9]{8}$/);

    const detail = await http.get(api(`/opportunities/${opportunitySlug}`)).expect(200);
    expect(detail.body.stats.tokensReserved).toBe(5);
    expect(detail.body.stats.tokensAvailable).toBe(95);
  });

  it('concilia el pago y emite los tokens', async () => {
    await http
      .post(api(`/admin/investments/${investmentId}/confirm-payment`))
      .set(auth(adminToken))
      .send({ amountCents: amountCents - 1, bankReference: `TRX-${run}` })
      .expect(400);

    const res = await http
      .post(api(`/admin/investments/${investmentId}/confirm-payment`))
      .set(auth(adminToken))
      .send({ amountCents, bankReference: `TRX-${run}` })
      .expect(200);
    expect(res.body.status).toBe('TOKENS_ISSUED');
    expect(res.body.mintTxHash).toMatch(/^0x[0-9a-f]{64}$/);

    // Idempotente.
    await http
      .post(api(`/admin/investments/${investmentId}/confirm-payment`))
      .set(auth(adminToken))
      .send({ amountCents, bankReference: `TRX-${run}` })
      .expect(200);
  });

  itLive('los tokens están en la wallet del inversor on-chain', async () => {
    const token = new Contract(tokenAddress, ERC20, provider!);
    expect(await token.balanceOf(investorWallet)).toBe(5n);
  });

  it('la cartera refleja los tokens', async () => {
    const res = await http.get(api('/portfolio')).set(auth(investorToken)).expect(200);
    expect(res.body.totals.investedCents).toBe(50_000);
    expect(res.body.holdings[0].tokens).toBe(5);
    expect(res.body.wallet.verified).toBe(true);
  });

  it('avanza el ciclo de vida y publica novedades', async () => {
    await http.post(api(`/admin/opportunities/${opportunityId}/transition`)).set(auth(adminToken)).send({ to: 'CLOSED' }).expect(400);
    await http.post(api(`/admin/opportunities/${opportunityId}/transition`)).set(auth(adminToken)).send({ to: 'FUNDED' }).expect(200);
    await http.post(api(`/admin/opportunities/${opportunityId}/transition`)).set(auth(adminToken)).send({ to: 'ACTIVE' }).expect(200);
    await http
      .post(api(`/admin/opportunities/${opportunityId}/updates`))
      .set(auth(adminToken))
      .send({ stage: 'HARVESTING', title: 'Empieza la cosecha', body: 'Las mazorcas están en su punto y empezamos la recolección.' })
      .expect(201);

    const notifs = await http.get(api('/notifications')).set(auth(investorToken)).expect(200);
    expect(notifs.body.items.some((n: { type: string }) => n.type === 'HARVEST_UPDATE')).toBe(true);
  });

  it('ejecuta un reparto y la cartera lo refleja', async () => {
    const preview = await http
      .get(api(`/admin/distributions/preview?opportunityId=${opportunityId}&totalAmountCents=56000`))
      .set(auth(adminToken))
      .expect(200);
    expect(preview.body.totalTokens).toBe(5);

    const created = await http
      .post(api('/admin/distributions'))
      .set(auth(adminToken))
      .send({ opportunityId, kind: 'FINAL', totalAmountCents: 56_000, note: 'Venta de la cosecha' })
      .expect(201);
    const executed = await http.post(api(`/admin/distributions/${created.body.id}/execute`)).set(auth(adminToken)).expect(200);
    expect(executed.body.status).toBe('EXECUTED');

    const portfolio = await http.get(api('/portfolio')).set(auth(investorToken)).expect(200);
    expect(portfolio.body.totals.receivedCents).toBe(56_000);
    expect(portfolio.body.payouts).toHaveLength(1);
  });

  itLive('el reparto llega en stablecoin a la wallet custodiada', async () => {
    const stable = new Contract(process.env.PAYMENT_TOKEN_ADDRESS!, ERC20, provider!);
    // 560,00 € con 6 decimales
    expect(await stable.balanceOf(investorWallet)).toBe(560_000_000n);
  });

  it('verifica públicamente un documento por su hash', async () => {
    const res = await http.get(api(`/documents/verify/${agronomyHash}`)).expect(200);
    expect(res.body.found).toBe(true);
    expect(res.body.type).toBe('AGRONOMY_REPORT');
    const missing = await http.get(api(`/documents/verify/${'0'.repeat(64)}`)).expect(200);
    expect(missing.body.found).toBe(false);
  });

  it('las estadísticas del backoffice cuadran', async () => {
    const res = await http.get(api('/admin/stats')).set(auth(adminToken)).expect(200);
    expect(res.body.raisedCents).toBeGreaterThanOrEqual(50_000);
    expect(res.body.blockchainMode).toBe(CHAIN_MODE);
    if (live) {
      expect(res.body.recentTransactions.every((t: { status: string }) => t.status !== 'FAILED')).toBe(true);
    }
  });
});
