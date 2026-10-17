// Exporta ABI y bytecode de los contratos a `abi/` y genera `dist/index.js`
// para que el backend los importe como paquete (@beanchain/contracts).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONTRACTS = [
  ["IdentityRegistry", "contracts/IdentityRegistry.sol"],
  ["HarvestCompliance", "contracts/compliance/HarvestCompliance.sol"],
  ["HarvestToken", "contracts/HarvestToken.sol"],
  ["DocumentRegistry", "contracts/DocumentRegistry.sol"],
  ["MockStablecoin", "contracts/mocks/MockStablecoin.sol"],
];

const abiDir = path.join(ROOT, "abi");
const distDir = path.join(ROOT, "dist");
fs.mkdirSync(abiDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

const exported = {};
for (const [name, source] of CONTRACTS) {
  const artifactPath = path.join(ROOT, "artifacts", source, `${name}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const out = { contractName: name, abi: artifact.abi, bytecode: artifact.bytecode };
  fs.writeFileSync(path.join(abiDir, `${name}.json`), JSON.stringify(out, null, 2));
  exported[name] = out;
}

const js =
  "\"use strict\";\n" +
  "Object.defineProperty(exports, \"__esModule\", { value: true });\n" +
  CONTRACTS.map(([name]) => `exports.${name} = require("../abi/${name}.json");`).join("\n") +
  "\n";
fs.writeFileSync(path.join(distDir, "index.js"), js);

const dts =
  "export interface ContractArtifact { contractName: string; abi: any[]; bytecode: string; }\n" +
  CONTRACTS.map(([name]) => `export declare const ${name}: ContractArtifact;`).join("\n") +
  "\n";
fs.writeFileSync(path.join(distDir, "index.d.ts"), dts);

console.log(`ABI exportados: ${CONTRACTS.map(([n]) => n).join(", ")}`);
