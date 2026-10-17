import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const ES = 724;
const DE = 276;
const KP = 408; // país bloqueado en los tests
const EUR = (n: number) => ethers.parseUnits(n.toString(), 6);
const KYC_REF = ethers.id("kyc-ref");

async function deployFixture() {
  const [admin, agent, alice, bob, carol, mallory, outsider] = await ethers.getSigners();

  const identity = await ethers.deployContract("IdentityRegistry", [admin.address]);
  const stable = await ethers.deployContract("MockStablecoin", ["Mock EURC", "mEURC"]);
  const compliance = await ethers.deployContract("HarvestCompliance", [
    admin.address,
    await identity.getAddress(),
    0,
    0,
  ]);
  const token = await ethers.deployContract("HarvestToken", [
    "Cacao Finca Chuao 2027",
    "CAC-CHU-27",
    "harvest-chuao-2027",
    1000,
    await stable.getAddress(),
    await identity.getAddress(),
    await compliance.getAddress(),
    admin.address,
  ]);
  await compliance.bindToken(await token.getAddress());

  const AGENT_ROLE = await token.AGENT_ROLE();
  await token.grantRole(AGENT_ROLE, agent.address);
  await identity.grantRole(await identity.AGENT_ROLE(), agent.address);

  for (const [signer, country] of [
    [alice, ES],
    [bob, DE],
    [carol, ES],
  ] as const) {
    await identity.connect(agent).registerIdentity(signer.address, country, 0, KYC_REF);
  }

  await stable.mint(agent.address, EUR(1_000_000));
  await stable.connect(agent).approve(await token.getAddress(), ethers.MaxUint256);

  return { admin, agent, alice, bob, carol, mallory, outsider, identity, stable, compliance, token, AGENT_ROLE };
}

describe("IdentityRegistry", () => {
  it("registra, consulta y elimina identidades", async () => {
    const { identity, agent, alice, mallory } = await loadFixture(deployFixture);
    expect(await identity.isVerified(alice.address)).to.equal(true);
    expect(await identity.investorCountry(alice.address)).to.equal(ES);
    expect(await identity.isVerified(mallory.address)).to.equal(false);

    await expect(identity.connect(agent).deleteIdentity(alice.address))
      .to.emit(identity, "IdentityRemoved")
      .withArgs(alice.address);
    expect(await identity.isVerified(alice.address)).to.equal(false);
    expect(await identity.identityCount()).to.equal(2);
  });

  it("caduca la verificación al pasar `expiresAt`", async () => {
    const { identity, agent, mallory } = await loadFixture(deployFixture);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await identity.connect(agent).registerIdentity(mallory.address, ES, now + 100, KYC_REF);
    expect(await identity.isVerified(mallory.address)).to.equal(true);
    await ethers.provider.send("evm_increaseTime", [200]);
    await ethers.provider.send("evm_mine", []);
    expect(await identity.isVerified(mallory.address)).to.equal(false);
  });

  it("sólo los agentes pueden registrar y no se duplica", async () => {
    const { identity, agent, alice, outsider } = await loadFixture(deployFixture);
    await expect(
      identity.connect(outsider).registerIdentity(outsider.address, ES, 0, KYC_REF),
    ).to.be.revertedWithCustomError(identity, "AccessControlUnauthorizedAccount");
    await expect(identity.connect(agent).registerIdentity(alice.address, ES, 0, KYC_REF))
      .to.be.revertedWithCustomError(identity, "AlreadyRegistered")
      .withArgs(alice.address);
    await expect(
      identity.connect(agent).registerIdentity(outsider.address, 0, 0, KYC_REF),
    ).to.be.revertedWithCustomError(identity, "InvalidCountry");
  });
});

describe("HarvestToken · emisión", () => {
  it("tiene 0 decimales y los metadatos de la cosecha", async () => {
    const { token } = await loadFixture(deployFixture);
    expect(await token.decimals()).to.equal(0);
    expect(await token.harvestId()).to.equal("harvest-chuao-2027");
    expect(await token.cap()).to.equal(1000);
  });

  it("sólo emite a wallets verificadas y respeta el límite", async () => {
    const { token, agent, alice, mallory } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 600);
    expect(await token.balanceOf(alice.address)).to.equal(600);

    await expect(token.connect(agent).mint(mallory.address, 1))
      .to.be.revertedWithCustomError(token, "RecipientNotVerified")
      .withArgs(mallory.address);

    await expect(token.connect(agent).mint(alice.address, 401))
      .to.be.revertedWithCustomError(token, "CapExceeded")
      .withArgs(1000, 1001);
  });

  it("sólo los agentes pueden emitir", async () => {
    const { token, alice } = await loadFixture(deployFixture);
    await expect(token.connect(alice).mint(alice.address, 1)).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("emite en lote", async () => {
    const { token, agent, alice, bob } = await loadFixture(deployFixture);
    await token.connect(agent).batchMint([alice.address, bob.address], [10, 20]);
    expect(await token.totalSupply()).to.equal(30);
    await expect(token.connect(agent).batchMint([alice.address], [1, 2])).to.be.revertedWithCustomError(
      token,
      "LengthMismatch",
    );
  });
});

describe("HarvestToken · transferencias", () => {
  it("permite transferir entre inversores verificados", async () => {
    const { token, agent, alice, bob } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 100);
    await token.connect(alice).transfer(bob.address, 40);
    expect(await token.balanceOf(bob.address)).to.equal(40);
  });

  it("bloquea transferencias a wallets sin KYC", async () => {
    const { token, agent, alice, mallory } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 100);
    await expect(token.connect(alice).transfer(mallory.address, 1))
      .to.be.revertedWithCustomError(token, "RecipientNotVerified")
      .withArgs(mallory.address);
  });

  it("respeta transferFrom con las mismas reglas", async () => {
    const { token, agent, alice, bob, mallory } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 100);
    await token.connect(alice).approve(bob.address, 50);
    await token.connect(bob).transferFrom(alice.address, bob.address, 30);
    expect(await token.balanceOf(bob.address)).to.equal(30);
    await expect(token.connect(bob).transferFrom(alice.address, mallory.address, 10)).to.be.revertedWithCustomError(
      token,
      "RecipientNotVerified",
    );
  });

  it("congela wallets y tokens parciales", async () => {
    const { token, agent, alice, bob } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 100);

    await token.connect(agent).setAddressFrozen(alice.address, true);
    await expect(token.connect(alice).transfer(bob.address, 1))
      .to.be.revertedWithCustomError(token, "WalletFrozen")
      .withArgs(alice.address);
    await token.connect(agent).setAddressFrozen(alice.address, false);

    await token.connect(agent).freezePartialTokens(alice.address, 80);
    await expect(token.connect(alice).transfer(bob.address, 21))
      .to.be.revertedWithCustomError(token, "InsufficientFreeBalance")
      .withArgs(alice.address, 20, 21);
    await token.connect(alice).transfer(bob.address, 20);

    await token.connect(agent).unfreezePartialTokens(alice.address, 30);
    expect(await token.frozenTokens(alice.address)).to.equal(50);
  });

  it("pausa y cierre detienen las transferencias", async () => {
    const { token, agent, alice, bob } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 100);

    await token.connect(agent).pause();
    await expect(token.connect(alice).transfer(bob.address, 1)).to.be.revertedWithCustomError(
      token,
      "EnforcedPause",
    );
    await token.connect(agent).unpause();

    await expect(token.connect(agent).close()).to.emit(token, "HarvestClosed");
    await expect(token.connect(alice).transfer(bob.address, 1)).to.be.revertedWithCustomError(
      token,
      "AlreadyClosed",
    );
    await expect(token.connect(agent).mint(alice.address, 1)).to.be.revertedWithCustomError(
      token,
      "AlreadyClosed",
    );
  });

  it("transferencia forzada y amortización liberan congelaciones", async () => {
    const { token, agent, alice, bob, mallory } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 100);
    await token.connect(agent).freezePartialTokens(alice.address, 100);

    await expect(token.connect(agent).forcedTransfer(alice.address, bob.address, 60))
      .to.emit(token, "ForcedTransfer")
      .withArgs(alice.address, bob.address, 60, agent.address);
    expect(await token.frozenTokens(alice.address)).to.equal(40);

    await expect(
      token.connect(agent).forcedTransfer(alice.address, mallory.address, 1),
    ).to.be.revertedWithCustomError(token, "RecipientNotVerified");

    await token.connect(agent).burn(alice.address, 40);
    expect(await token.balanceOf(alice.address)).to.equal(0);
    expect(await token.frozenTokens(alice.address)).to.equal(0);
  });
});

describe("HarvestCompliance", () => {
  it("bloquea países sancionados o no autorizados", async () => {
    const { token, compliance, identity, agent, admin, alice, mallory } = await loadFixture(deployFixture);
    await identity.connect(agent).registerIdentity(mallory.address, KP, 0, KYC_REF);
    await compliance.connect(admin).setCountryBlocked(KP, true);

    await expect(token.connect(agent).mint(mallory.address, 1)).to.be.revertedWithCustomError(
      token,
      "TransferNotCompliant",
    );
    await token.connect(agent).mint(alice.address, 10);
    await expect(token.connect(alice).transfer(mallory.address, 1)).to.be.revertedWithCustomError(
      token,
      "TransferNotCompliant",
    );
  });

  it("limita el saldo máximo por inversor", async () => {
    const { token, compliance, admin, agent, alice, bob } = await loadFixture(deployFixture);
    await compliance.connect(admin).setMaxBalancePerInvestor(100);
    await token.connect(agent).mint(alice.address, 100);
    await expect(token.connect(agent).mint(alice.address, 1)).to.be.revertedWithCustomError(
      token,
      "TransferNotCompliant",
    );
    await token.connect(agent).mint(bob.address, 50);
    await expect(token.connect(alice).transfer(bob.address, 51)).to.be.revertedWithCustomError(
      token,
      "TransferNotCompliant",
    );
  });

  it("limita y cuenta los titulares", async () => {
    const { token, compliance, admin, agent, alice, bob, carol } = await loadFixture(deployFixture);
    await compliance.connect(admin).setMaxHolders(2);

    await token.connect(agent).mint(alice.address, 10);
    await token.connect(agent).mint(bob.address, 10);
    expect(await compliance.holderCount()).to.equal(2);

    await expect(token.connect(agent).mint(carol.address, 10)).to.be.revertedWithCustomError(
      token,
      "TransferNotCompliant",
    );
    // Si alice transfiere todo a carol, el número de titulares no cambia: permitido.
    await token.connect(alice).transfer(carol.address, 10);
    expect(await compliance.holderCount()).to.equal(2);

    await token.connect(agent).burn(bob.address, 10);
    expect(await compliance.holderCount()).to.equal(1);
  });

  it("sólo el token vinculado puede llamar a los hooks y sólo se vincula una vez", async () => {
    const { compliance, admin, outsider } = await loadFixture(deployFixture);
    await expect(compliance.connect(outsider).created(outsider.address, 1)).to.be.revertedWithCustomError(
      compliance,
      "OnlyToken",
    );
    await expect(compliance.connect(admin).bindToken(outsider.address)).to.be.revertedWithCustomError(
      compliance,
      "AlreadyBound",
    );
  });
});

describe("HarvestToken · repartos", () => {
  it("reparte en proporción a los tokens", async () => {
    const { token, stable, agent, alice, bob } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 300);
    await token.connect(agent).mint(bob.address, 100);

    await expect(token.connect(agent).distribute(EUR(4000)))
      .to.emit(token, "Distributed")
      .withArgs(agent.address, EUR(4000), EUR(4000));

    expect(await token.withdrawableOf(alice.address)).to.equal(EUR(3000));
    expect(await token.withdrawableOf(bob.address)).to.equal(EUR(1000));

    await expect(token.connect(alice).claim()).to.emit(token, "Claimed").withArgs(alice.address, EUR(3000));
    expect(await stable.balanceOf(alice.address)).to.equal(EUR(3000));
    expect(await token.withdrawableOf(alice.address)).to.equal(0);
    await expect(token.connect(alice).claim()).to.be.revertedWithCustomError(token, "NothingToClaim");
  });

  it("mantiene lo devengado cuando los tokens cambian de mano", async () => {
    const { token, agent, alice, bob } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 100);
    await token.connect(agent).distribute(EUR(1000)); // todo para alice

    await token.connect(alice).transfer(bob.address, 50);
    await token.connect(agent).distribute(EUR(1000)); // mitad y mitad

    expect(await token.withdrawableOf(alice.address)).to.equal(EUR(1500));
    expect(await token.withdrawableOf(bob.address)).to.equal(EUR(500));
  });

  it("conserva lo devengado tras amortizar los tokens", async () => {
    const { token, agent, alice } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 100);
    await token.connect(agent).distribute(EUR(500));
    await token.connect(agent).burn(alice.address, 100);
    expect(await token.withdrawableOf(alice.address)).to.equal(EUR(500));
    await token.connect(alice).claim();
  });

  it("el agente puede empujar pagos, siempre al titular", async () => {
    const { token, stable, agent, alice, bob } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 1);
    await token.connect(agent).mint(bob.address, 1);
    await token.connect(agent).distribute(EUR(10));
    await token.connect(agent).batchClaimFor([alice.address, bob.address]);
    expect(await stable.balanceOf(alice.address)).to.equal(EUR(5));
    expect(await stable.balanceOf(bob.address)).to.equal(EUR(5));
    expect(await token.totalClaimed()).to.equal(EUR(10));
  });

  it("no reparte sin tokens emitidos ni a wallets congeladas", async () => {
    const { token, agent, alice } = await loadFixture(deployFixture);
    await expect(token.connect(agent).distribute(EUR(1))).to.be.revertedWithCustomError(token, "NoSupply");
    await token.connect(agent).mint(alice.address, 1);
    await token.connect(agent).distribute(EUR(1));
    await token.connect(agent).setAddressFrozen(alice.address, true);
    await expect(token.connect(alice).claim()).to.be.revertedWithCustomError(token, "WalletFrozen");
  });

  it("sigue repartiendo después del cierre", async () => {
    const { token, agent, alice } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 10);
    await token.connect(agent).close();
    await token.connect(agent).distribute(EUR(100));
    expect(await token.withdrawableOf(alice.address)).to.equal(EUR(100));
  });
});

describe("HarvestToken · recuperación de wallet", () => {
  it("traspasa saldo, congelaciones y pendiente a la nueva wallet", async () => {
    const { token, stable, identity, agent, alice, mallory } = await loadFixture(deployFixture);
    await token.connect(agent).mint(alice.address, 100);
    await token.connect(agent).freezePartialTokens(alice.address, 10);
    await token.connect(agent).distribute(EUR(200));

    await expect(token.connect(agent).recoveryAddress(alice.address, mallory.address)).to.be.revertedWithCustomError(
      token,
      "RecipientNotVerified",
    );

    await identity.connect(agent).registerIdentity(mallory.address, ES, 0, KYC_REF);
    await expect(token.connect(agent).recoveryAddress(alice.address, mallory.address))
      .to.emit(token, "RecoverySuccess")
      .withArgs(alice.address, mallory.address, 100);

    expect(await token.balanceOf(mallory.address)).to.equal(100);
    expect(await token.frozenTokens(mallory.address)).to.equal(10);
    expect(await stable.balanceOf(mallory.address)).to.equal(EUR(200));
    expect(await token.withdrawableOf(alice.address)).to.equal(0);
    expect(await token.withdrawableOf(mallory.address)).to.equal(0);

    await token.connect(agent).distribute(EUR(100));
    expect(await token.withdrawableOf(mallory.address)).to.equal(EUR(100));
  });
});

describe("DocumentRegistry", () => {
  it("ancla hashes una sola vez y los lista por cosecha", async () => {
    const [admin, outsider] = await ethers.getSigners();
    const docs = await ethers.deployContract("DocumentRegistry", [admin.address]);
    const subject = ethers.id("harvest-chuao-2027");
    const hash = ethers.sha256(ethers.toUtf8Bytes("informe agronómico v1"));

    await expect(docs.anchor(hash, subject, "AGRONOMY_REPORT", "ipfs://x"))
      .to.emit(docs, "DocumentAnchored")
      .withArgs(hash, subject, "AGRONOMY_REPORT", "ipfs://x", admin.address);

    expect(await docs.isAnchored(hash)).to.equal(true);
    expect(await docs.documentsOf(subject)).to.deep.equal([hash]);
    expect((await docs.recordOf(hash)).docType).to.equal("AGRONOMY_REPORT");

    await expect(docs.anchor(hash, subject, "X", "")).to.be.revertedWithCustomError(docs, "AlreadyAnchored");
    await expect(docs.anchor(ethers.ZeroHash, subject, "X", "")).to.be.revertedWithCustomError(docs, "ZeroHash");
    await expect(docs.connect(outsider).anchor(ethers.id("y"), subject, "X", "")).to.be.revertedWithCustomError(
      docs,
      "AccessControlUnauthorizedAccount",
    );
  });
});
