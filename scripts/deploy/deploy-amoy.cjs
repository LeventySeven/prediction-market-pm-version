const { ethers } = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");
const { Wallet } = require("ethers");

/**
 * Deploy contracts to Polygon Amoy testnet
 *
 * Usage:
 *   bun run contracts:deploy:amoy
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY set in .env
 *   - ALCHEMY_API_KEY set in .env (or ALCHEMY_POLYGON_AMOY_URL / POLYGON_AMOY_RPC_URL)
 *   - Amoy MATIC in deployer wallet
 *
 * Optional:
 *   - QUOTE_SIGNER_ADDRESS or QUOTE_SIGNER_PRIVATE_KEY (recommended)
 *     If set, we'll configure the vault's quoteSigner accordingly.
 */
async function main() {
  console.log("Starting Polygon Amoy deployment...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "MATIC\n");

  if (balance === 0n) throw new Error("Deployer has no MATIC (Amoy).");

  console.log("Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log("MockUSDC:", mockUSDCAddress);

  console.log("\nDeploying PredictionMarketVault...");
  const PredictionMarketVault = await ethers.getContractFactory("PredictionMarketVault");
  const vault = await PredictionMarketVault.deploy([mockUSDCAddress]);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("Vault:", vaultAddress);

  // Configure quote signer (backend EIP-712 signing key)
  const quoteSignerPk = (process.env.QUOTE_SIGNER_PRIVATE_KEY || "").trim();
  const quoteSignerFromPk = quoteSignerPk
    ? new Wallet(quoteSignerPk.startsWith("0x") ? quoteSignerPk : `0x${quoteSignerPk}`).address
    : "";
  const quoteSignerAddress =
    process.env.QUOTE_SIGNER_ADDRESS || quoteSignerFromPk || deployer.address;

  if (!quoteSignerAddress) throw new Error("QUOTE_SIGNER not configured");

  console.log("\nSetting QuoteSigner:", quoteSignerAddress);
  const setSignerTx = await vault.setQuoteSigner(quoteSignerAddress);
  await setSignerTx.wait();

  const deployment = {
    network: "amoy",
    chainId: 80002,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    quoteSigner: quoteSignerAddress,
    contracts: {
      MockUSDC: mockUSDCAddress,
      PredictionMarketVault: vaultAddress,
    },
  };

  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const outPath = path.join(deploymentsDir, "amoy.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));

  console.log("\nSaved:", outPath);
  console.log("\nAdd to env:\n");
  console.log(`NEXT_PUBLIC_VAULT_ADDRESS_AMOY=${vaultAddress}`);
  console.log(`NEXT_PUBLIC_USDC_ADDRESS_AMOY=${mockUSDCAddress}`);
  console.log("NEXT_PUBLIC_CHAIN_ID=80002");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

