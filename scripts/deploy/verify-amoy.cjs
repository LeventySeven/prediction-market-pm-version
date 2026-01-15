const { ethers } = require("hardhat");
const { Wallet } = require("ethers");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function requireAddress(name, value) {
  const v = String(value || "").trim();
  if (!ADDRESS_RE.test(v)) {
    throw new Error(`${name} is not set or invalid (${v || "empty"})`);
  }
  return v;
}

function resolveExpectedQuoteSigner() {
  const addr = String(process.env.QUOTE_SIGNER_ADDRESS || "").trim();
  if (ADDRESS_RE.test(addr)) return addr;

  const pk = String(process.env.QUOTE_SIGNER_PRIVATE_KEY || "").trim();
  if (pk) {
    const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
    return new Wallet(normalized).address;
  }
  return "";
}

/**
 * Verify Polygon Amoy deployment + config alignment.
 *
 * Usage:
 *   hardhat run scripts/deploy/verify-amoy.cjs --network amoy
 *
 * Requires:
 *   NEXT_PUBLIC_VAULT_ADDRESS_AMOY
 *   NEXT_PUBLIC_USDC_ADDRESS_AMOY
 *   QUOTE_SIGNER_PRIVATE_KEY (or QUOTE_SIGNER_ADDRESS)
 */
async function main() {
  console.log("Verifying Polygon Amoy deployment...\n");

  const vaultAddress = requireAddress("NEXT_PUBLIC_VAULT_ADDRESS_AMOY", process.env.NEXT_PUBLIC_VAULT_ADDRESS_AMOY);
  const usdcAddress = requireAddress("NEXT_PUBLIC_USDC_ADDRESS_AMOY", process.env.NEXT_PUBLIC_USDC_ADDRESS_AMOY);

  const expectedSigner = resolveExpectedQuoteSigner();
  if (!ADDRESS_RE.test(expectedSigner)) {
    throw new Error("QUOTE_SIGNER_PRIVATE_KEY or QUOTE_SIGNER_ADDRESS must be set for verification");
  }

  // Basic on-chain existence checks (code != 0x)
  const [vaultCode, usdcCode] = await Promise.all([
    ethers.provider.getCode(vaultAddress),
    ethers.provider.getCode(usdcAddress),
  ]);

  if (vaultCode === "0x") throw new Error(`Vault has no code at ${vaultAddress} (wrong address / wrong chain)`);
  if (usdcCode === "0x") throw new Error(`USDC has no code at ${usdcAddress} (wrong address / wrong chain)`);

  const Vault = await ethers.getContractFactory("PredictionMarketVault");
  const vault = Vault.attach(vaultAddress);

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = MockUSDC.attach(usdcAddress);

  const [owner, quoteSigner, supported, decimals, symbol] = await Promise.all([
    vault.owner(),
    vault.quoteSigner(),
    vault.supportedTokens(usdcAddress),
    usdc.decimals(),
    usdc.symbol(),
  ]);

  console.log("Vault:", vaultAddress);
  console.log("USDC:", usdcAddress, `(${symbol}, decimals=${decimals})`);
  console.log("Owner:", owner);
  console.log("QuoteSigner (on-chain):", quoteSigner);
  console.log("QuoteSigner (expected):", expectedSigner);
  console.log("supportedTokens(USDC):", supported);

  if (!supported) throw new Error("Vault does not list USDC as supported token");
  if (String(decimals) !== "6") throw new Error(`Unexpected token decimals: ${decimals} (expected 6)`);
  if (quoteSigner.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new Error("QUOTE_SIGNER_MISMATCH (backend key does not match vault.quoteSigner)");
  }

  console.log("\nOK: Amoy deployment looks consistent.\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

