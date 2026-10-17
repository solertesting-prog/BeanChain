/**
 * Despliega la infraestructura compartida de BeanChain:
 *   - IdentityRegistry (wallets con KYC)
 *   - DocumentRegistry (hashes de documentos)
 *   - MockStablecoin (sólo si no se indica PAYMENT_TOKEN_ADDRESS)
 *
 * Los HarvestToken (uno por cosecha) los despliega el backend al publicar
 * cada oportunidad, usando estas direcciones.
 *
 *   pnpm deploy:local          (red local de Hardhat)
 *   pnpm deploy:amoy           (testnet de Polygon)
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const operator = process.env.PLATFORM_OPERATOR_ADDRESS ?? deployer.address;
  console.log(`Red: ${network.name} · desplegando con ${deployer.address}`);

  const identity = await ethers.deployContract("IdentityRegistry", [deployer.address]);
  await identity.waitForDeployment();

  const documents = await ethers.deployContract("DocumentRegistry", [deployer.address]);
  await documents.waitForDeployment();

  let paymentToken = process.env.PAYMENT_TOKEN_ADDRESS;
  if (!paymentToken) {
    const mock = await ethers.deployContract("MockStablecoin", ["Mock EURC", "mEURC"]);
    await mock.waitForDeployment();
    paymentToken = await mock.getAddress();
    console.log(`MockStablecoin: ${paymentToken} (sólo pruebas)`);
  }

  if (operator.toLowerCase() !== deployer.address.toLowerCase()) {
    const AGENT_ROLE = await identity.AGENT_ROLE();
    await (await identity.grantRole(AGENT_ROLE, operator)).wait();
    await (await documents.grantRole(AGENT_ROLE, operator)).wait();
    console.log(`Rol de agente concedido al operador ${operator}`);
  }

  const result = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    operator,
    identityRegistry: await identity.getAddress(),
    documentRegistry: await documents.getAddress(),
    paymentToken,
    deployedAt: new Date().toISOString(),
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(result, null, 2));

  console.log(JSON.stringify(result, null, 2));
  console.log("\nCopia estas direcciones en apps/api/.env (IDENTITY_REGISTRY_ADDRESS, DOCUMENT_REGISTRY_ADDRESS, PAYMENT_TOKEN_ADDRESS).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
