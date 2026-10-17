# BeanChain

Plataforma de prefinanciación de cosechas de cacao y café. Cada cosecha se tokeniza como un **security token permisionado ERC-3643**. Los inversores verificados (KYC) compran tokens, siguen la cosecha y cobran su parte de la venta mediante repartos automáticos en stablecoin.

> El token representa un derecho sobre los **ingresos netos de una cosecha concreta**, emitido por una sociedad vehículo, y **no sobre la tierra**. Así la finca no arriesga su propiedad y el derecho del inversor queda bien definido.

## Estructura

```
packages/contracts   Smart contracts (Solidity 0.8.24, Hardhat, OpenZeppelin 5)
apps/api             API REST (NestJS 10, Prisma 5, PostgreSQL 16)
apps/web             Web (Next.js 14, React 18, Tailwind)
```

## Smart contracts

| Contrato | Qué hace |
| --- | --- |
| `IdentityRegistry` | Registro compartido de wallets con KYC vigente: país (ISO numérico), caducidad y referencia opaca. Sin datos personales. |
| `HarvestCompliance` | Reglas de cada emisión: países bloqueados, saldo máximo por inversor y número máximo de titulares. |
| `HarvestToken` | Token de una cosecha (0 decimales, emisión máxima fija). Sólo se mueve entre wallets verificadas que cumplen las reglas. Los agentes pueden emitir, amortizar, congelar, forzar transferencias y recuperar wallets perdidas. Incluye el **distribuidor de rendimientos**: el agente deposita stablecoin con `distribute()` y cada titular cobra en proporción a sus tokens, aunque hayan cambiado de mano entre repartos. |
| `DocumentRegistry` | Ancla el hash SHA-256 de informes, facturas y contratos como prueba de integridad. |
| `MockStablecoin` | Stablecoin de 6 decimales sólo para pruebas. |

**Ciclo de vida del token:** se despliega al publicar la oportunidad → se emite a cada inversor al confirmarse su pago → durante la cosecha vale su parte del rendimiento esperado → el comprador paga y la plataforma ejecuta el reparto → al finalizar se cierra (`close()`): no admite más emisiones ni transferencias, pero los cobros pendientes siguen disponibles.

Red objetivo: **Polygon** (Amoy en pruebas).

## API

Módulos principales (prefijo `/v1`):

- **Auth**: registro, login, refresh tokens rotatorios con detección de reutilización, verificación de correo, cambio de contraseña y MFA TOTP.
- **KYC genérico**: interfaz `KycProvider` con proveedor de pruebas (`mock`, revisión manual en backoffice) y **Sumsub** (SDK web + webhooks firmados con HMAC). Al aprobarse, se crea la wallet y se registra en el `IdentityRegistry`.
- **Wallets**: custodiadas (clave cifrada con AES-256-GCM) o propias vinculadas mediante firma.
- **Fincas**: alta, historial de producción y revisión de sanciones obligatoria antes de publicar.
- **Oportunidades**: borrador → checklist de publicación (sanciones + documentación mínima) → publicación con despliegue del token → captación → financiada → en cultivo → en reparto → cerrada (o cancelada con amortización y devolución).
- **Inversiones**: simulación previa, reglas de elegibilidad (KYC, país, fechas, mínimos y máximos, disponibilidad con bloqueo de fila), aviso a minoristas del Reglamento (UE) 2020/1503, reserva con caducidad, pago por transferencia SEPA (conciliación en backoffice) o tarjeta (Stripe Checkout + webhook firmado), y emisión de tokens.
- **Repartos**: cálculo proporcional, depósito on-chain y pago automático a wallets custodiadas.
- **Novedades y documentos**: etapas de la cosecha, subida a disco local o S3, anclaje on-chain y verificación pública por hash.
- **Cartera, notificaciones, estadísticas y auditoría.**

La blockchain funciona en dos modos (`BLOCKCHAIN_MODE`): `simulated` para desarrollo sin red y `live` contra un RPC real.

## Puesta en marcha en local

**En Windows:** haz doble clic en `iniciar.bat` (o `iniciar.bat -ConBlockchain` para usar además una blockchain local). Instala lo que falte, prepara la base de datos y abre la web.

**Manual:**

Requisitos: Node.js 20+, pnpm 10 y Docker.

```bash
pnpm install
pnpm db:up                                   # PostgreSQL en Docker
cp apps/api/.env.example apps/api/.env       # revisa los valores
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @beanchain/contracts build     # compila contratos y exporta ABI
pnpm db:migrate                              # aplica migraciones
pnpm db:seed                                 # admin + finca y oportunidad de ejemplo
pnpm api:dev                                 # http://localhost:4000
pnpm web:dev                                 # http://localhost:3000
```

Entra con el administrador definido en `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

### Con una blockchain local

```bash
pnpm contracts:node                    # en otra terminal: nodo Hardhat en :8545
pnpm contracts:deploy:local            # despliega IdentityRegistry, DocumentRegistry y MockStablecoin
```

Copia las direcciones que imprime en `apps/api/.env`, pon `BLOCKCHAIN_MODE=live` y usa como `OPERATOR_PRIVATE_KEY` la cuenta 0 que muestra el nodo (sólo para la red local).

### Recorrido de prueba

1. Backoffice → **Fincas** → revisa la finca de ejemplo y registra la revisión de sanciones.
2. **Oportunidades** → abre el borrador, sube contrato, ficha de datos fundamentales, informe agronómico y carta del comprador → **Publicar**.
3. En otra ventana, crea una cuenta de inversor y completa la verificación (formulario de pruebas).
4. Backoffice → **Verificaciones KYC** → aprueba.
5. El inversor reserva tokens con transferencia. Backoffice → **Inversiones y cobros** → concilia con el concepto `BC-…`.
6. Pasa la oportunidad a *Financiada* y *En cultivo*, publica novedades y ejecuta un reparto.

## Tests y CI

```bash
pnpm contracts:test                                    # 25 tests de contratos
pnpm --filter @beanchain/api test                      # unitarios
pnpm --filter @beanchain/api test:e2e                  # recorrido completo (necesita PostgreSQL)
E2E_BLOCKCHAIN_MODE=live pnpm --filter @beanchain/api test:e2e   # contra un nodo Hardhat con los contratos desplegados
```

GitHub Actions ejecuta en cada push: contratos (compilación, tests y tamaño), API (tipos, build, unitarios, migraciones, drift del esquema y e2e), integración on-chain (nodo Hardhat + despliegue + e2e con comprobación de saldos reales) y web (tipos y build). Los logs y el lockfile generado se publican en las ramas `ci-output/<job>`.

## Antes de producción

Esto es una base funcional, no un sistema listo para captar dinero real. Pendiente:

- [ ] **Asesoramiento legal**: naturaleza del token (valor negociable), vehículo emisor, régimen ECSP / folleto / Ley 6/2023, y análisis de sanciones sobre Venezuela con un despacho especializado.
- [ ] **Auditoría de los smart contracts** por una firma externa. Valorar migrar a la suite oficial T-REX (ERC-3643 con ONCHAINID).
- [ ] **Custodia**: sustituir el cifrado propio de claves por un KMS/HSM o un custodio MPC (Fireblocks, Dfns, Privy…). La clave del operador, en un KMS o multisig.
- [ ] **Pagos**: cuenta de garantía o entidad de pago autorizada para los fondos de los inversores; on-ramp/off-ramp de stablecoin para los repartos.
- [ ] **KYC real** (Sumsub u otro) con cribado AML/PEP/sanciones continuo.
- [ ] Textos legales (términos, privacidad, ficha de datos fundamentales) y revisión de los avisos de riesgo.
- [ ] Infraestructura: despliegue, copias de seguridad, monitorización, alertas de transacciones fallidas y rotación de secretos.
- [ ] Mercado secundario regulado (fuera del alcance de esta versión).

## Licencia

Privado. Todos los derechos reservados.
