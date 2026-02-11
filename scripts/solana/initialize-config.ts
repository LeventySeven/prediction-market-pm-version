import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection, SystemProgram } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { getPredictionMarketVaultProgramId, getSolanaRpcUrl, getUsdcMint } from "@/lib/solana/config";

const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

function loadKeypairFromFile(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const rpcUrl = getSolanaRpcUrl();
  const connection = new Connection(rpcUrl, "confirmed");

  const deployerPath = process.env.SOLANA_DEPLOYER_KEYPAIR || "./anchor/deployer-keypair.json";
  const authority = loadKeypairFromFile(deployerPath);

  const quoteAuthorityRaw = process.env.SOLANA_QUOTE_AUTHORITY;
  if (!quoteAuthorityRaw || quoteAuthorityRaw.trim().length === 0) {
    throw new Error("SOLANA_QUOTE_AUTHORITY is required");
  }
  const quoteAuthority = new PublicKey(quoteAuthorityRaw);

  const programId = getPredictionMarketVaultProgramId();
  const usdcMint = getUsdcMint();
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const [programData] = PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_LOADER_UPGRADEABLE_PROGRAM_ID);

  const existing = await connection.getAccountInfo(configPda, "confirmed");
  if (existing) {
    process.stdout.write("Config PDA is already initialized.\n");
    process.stdout.write(`programId=${programId.toBase58()}\n`);
    process.stdout.write(`configPda=${configPda.toBase58()}\n`);
    process.stdout.write(`quoteAuthority=${quoteAuthority.toBase58()}\n`);
    process.stdout.write(`usdcMint=${usdcMint.toBase58()}\n`);
    return;
  }

  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idlPath = "./anchor/target/idl/prediction_market_vault.json";
  const idl = JSON.parse(readFileSync(idlPath, "utf8")) as anchor.Idl;
  const program = new anchor.Program(idl, provider);

  const sig = await program.methods
    .initializeConfig(quoteAuthority)
    .accounts({
      authority: authority.publicKey,
      programData,
      config: configPda,
      usdcMint,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  process.stdout.write("Config initialized.\n");
  process.stdout.write(`signature=${sig}\n`);
  process.stdout.write(`programId=${programId.toBase58()}\n`);
  process.stdout.write(`configPda=${configPda.toBase58()}\n`);
  process.stdout.write(`quoteAuthority=${quoteAuthority.toBase58()}\n`);
  process.stdout.write(`usdcMint=${usdcMint.toBase58()}\n`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
