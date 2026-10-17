/**
 * Datos iniciales: usuario administrador y una finca/oportunidad de ejemplo
 * en borrador. Ejecutar con `pnpm db:seed`.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@beanchain.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'CambiaEsto123!';

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await bcrypt.hash(password, 12),
      firstName: 'Admin',
      lastName: 'BeanChain',
      country: 'ES',
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Administrador: ${admin.email}`);

  const farm = await prisma.farm.upsert({
    where: { slug: 'hacienda-ejemplo-sucre' },
    update: {},
    create: {
      slug: 'hacienda-ejemplo-sucre',
      name: 'Hacienda Ejemplo',
      crop: 'CACAO',
      varieties: ['Trinitario', 'Criollo'],
      country: 'VE',
      region: 'Sucre',
      municipality: '[MUNICIPIO]',
      hectares: 25,
      altitudeM: 150,
      description:
        'Finca de ejemplo para probar la plataforma. Sustituye estos datos por los de una finca real: historia, manejo agronómico, certificaciones y equipo.',
      ownerName: '[PROPIETARIO O COOPERATIVA]',
      ownerType: 'OWNER',
      productionHistory: [
        { year: 2023, kg: 9000 },
        { year: 2024, kg: 10500 },
        { year: 2025, kg: 11200 },
      ],
      sanctionsClear: false,
      sanctionsNote: 'Pendiente de revisión OFAC/UE',
    },
  });
  console.log(`Finca de ejemplo: ${farm.name}`);

  const closesAt = new Date(Date.now() + 45 * 86_400_000);
  await prisma.opportunity.upsert({
    where: { slug: 'hacienda-ejemplo-cosecha-2027' },
    update: {},
    create: {
      slug: 'hacienda-ejemplo-cosecha-2027',
      farmId: farm.id,
      title: 'Hacienda Ejemplo · cosecha 2027',
      summary: 'Prefinanciación de la cosecha 2027 de cacao fino de aroma con venta comprometida a un chocolatero europeo.',
      description:
        'Describe aquí el destino del capital (mano de obra, fermentación, secado, logística), el contrato con el comprador, el calendario y cómo se calcula el rendimiento.',
      harvestYear: 2027,
      tokenPriceCents: 10_000,
      totalTokens: 1_000,
      targetAmountCents: 10_000 * 1_000,
      minTokens: 1,
      maxTokensPerInvestor: 200,
      expectedReturnBps: 1_200,
      termMonths: 12,
      platformFeeBps: 300,
      buyerName: '[COMPRADOR EUROPEO]',
      riskLevel: 'HIGH',
      risks: ['Clima y plagas', 'Precio del cacao', 'Permisos de exportación', 'Sanciones y riesgo país', 'Baja liquidez'],
      closesAt,
      expectedPayoutAt: new Date(Date.now() + 365 * 86_400_000),
      blockedCountries: ['US'],
      tokenName: 'Cacao Hacienda Ejemplo 2027',
      tokenSymbol: 'CAC-EJ-27',
    },
  });
  console.log('Oportunidad de ejemplo creada en borrador');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
