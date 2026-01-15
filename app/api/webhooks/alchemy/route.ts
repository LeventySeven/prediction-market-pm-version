import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { decodeEventLog, type Hex } from "viem";
import { getSupabaseServiceClient } from "@/src/server/supabase/client";
import { PREDICTION_MARKET_VAULT_ABI } from "@/lib/contracts/abis";

// Must run on Node (crypto + service role key).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function timingSafeEqualHex(a: string, b: string) {
  // Normalize (strip optional 0x, lowercase)
  const aa = a.replace(/^0x/i, "").toLowerCase();
  const bb = b.replace(/^0x/i, "").toLowerCase();
  if (aa.length !== bb.length) return false;
  const abuf = Buffer.from(aa, "hex");
  const bbuf = Buffer.from(bb, "hex");
  if (abuf.length !== bbuf.length) return false;
  return crypto.timingSafeEqual(abuf, bbuf);
}

function verifyAlchemySignature(rawBody: Buffer, signatureHeader: string | null) {
  const signingKey = process.env.ALCHEMY_WEBHOOK_SECRET || "";
  if (!signingKey) return { ok: false, reason: "ALCHEMY_WEBHOOK_SECRET_NOT_CONFIGURED" };
  if (!signatureHeader) return { ok: false, reason: "MISSING_SIGNATURE" };

  // Alchemy uses hex digest. Some examples show raw hex, others may include "sha256=" prefix.
  const sig = signatureHeader.trim().replace(/^sha256=/i, "");

  const digest = crypto.createHmac("sha256", signingKey).update(rawBody).digest("hex");
  const ok = timingSafeEqualHex(digest, sig);
  return ok ? { ok: true as const } : { ok: false as const, reason: "INVALID_SIGNATURE" };
}

function networkToChainId(network: string | undefined): number | null {
  if (!network) return null;
  const n = network.toUpperCase();
  // Common Alchemy formats for Notify "Address Activity" webhooks.
  if (n.includes("SEPOLIA")) return 11155111;
  // Polygon Amoy (Alchemy commonly uses POLYGON_AMOY / MATIC_AMOY style identifiers)
  if (n.includes("AMOY")) return 80002;
  if (n === "ETH_MAINNET" || n === "ETHEREUM_MAINNET" || n === "ETH_MAINNET_GOERLI_DEPRECATED") return 1;
  if (n.includes("MAINNET")) return 1;
  return null;
}

function getVaultAddressForChain(chainId: number): string {
  if (chainId === 11155111) return process.env.NEXT_PUBLIC_VAULT_ADDRESS_SEPOLIA || "";
  if (chainId === 80002) return process.env.NEXT_PUBLIC_VAULT_ADDRESS_AMOY || "";
  if (chainId === 1) return process.env.NEXT_PUBLIC_VAULT_ADDRESS_MAINNET || "";
  return "";
}

function tokenToAssetCode(chainId: number, tokenAddress: string): "USDC" | "USDT" | null {
  const addr = tokenAddress.toLowerCase();
  if (chainId === 11155111) {
    const usdc = (process.env.NEXT_PUBLIC_USDC_ADDRESS_SEPOLIA || "").toLowerCase();
    const usdt = (process.env.NEXT_PUBLIC_USDT_ADDRESS_SEPOLIA || "").toLowerCase();
    if (usdc && addr === usdc) return "USDC";
    if (usdt && addr === usdt) return "USDT";
    return null;
  }
  if (chainId === 80002) {
    const usdc = (process.env.NEXT_PUBLIC_USDC_ADDRESS_AMOY || "").toLowerCase();
    const usdt = (process.env.NEXT_PUBLIC_USDT_ADDRESS_AMOY || "").toLowerCase();
    if (usdc && addr === usdc) return "USDC";
    if (usdt && addr === usdt) return "USDT";
    return null;
  }
  if (chainId === 1) {
    const usdc = (process.env.NEXT_PUBLIC_USDC_ADDRESS_MAINNET || "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48").toLowerCase();
    const usdt = (process.env.NEXT_PUBLIC_USDT_ADDRESS_MAINNET || "0xdAC17F958D2ee523a2206206994597C13D831ec7").toLowerCase();
    if (addr === usdc) return "USDC";
    if (addr === usdt) return "USDT";
    return null;
  }
  return null;
}

type AlchemyAddressActivityPayload = {
  webhookId?: string;
  id?: string;
  createdAt?: string;
  type?: string;
  event?: {
    network?: string;
    activity?: Array<{
      // varies by category; we care about `log` for contract events
      hash?: string;
      fromAddress?: string;
      toAddress?: string;
      log?: {
        address: string;
        data: string;
        topics: string[];
        blockNumber?: number;
        transactionHash: string;
        logIndex?: number;
        removed?: boolean;
      };
    }>;
  };
};

function isHexString(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]*$/.test(v);
}

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const sigHeader =
    req.headers.get("x-alchemy-signature") || req.headers.get("X-Alchemy-Signature");

  const verified = verifyAlchemySignature(raw, sigHeader);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.reason }, { status: 401 });
  }

  let payload: AlchemyAddressActivityPayload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const chainId = networkToChainId(payload.event?.network);
  if (!chainId) {
    return NextResponse.json({ ok: false, error: "UNSUPPORTED_NETWORK" }, { status: 400 });
  }

  const vaultAddress = getVaultAddressForChain(chainId);
  if (!ADDRESS_RE.test(vaultAddress)) {
    return NextResponse.json({ ok: false, error: "VAULT_ADDRESS_NOT_CONFIGURED" }, { status: 500 });
  }

  const activities = payload.event?.activity ?? [];
  if (!Array.isArray(activities) || activities.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const supabase = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  let processed = 0;
  let ignored = 0;
  const errors: Array<{ txHash?: string; reason: string }> = [];

  for (const act of activities) {
    const log = act.log;
    if (!log || log.removed) {
      ignored++;
      continue;
    }

    const logAddress = String(log.address || "").toLowerCase();
    if (logAddress !== vaultAddress.toLowerCase()) {
      ignored++;
      continue;
    }

    const txHash = String(log.transactionHash || act.hash || "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      ignored++;
      continue;
    }

    // Idempotency: if we already marked this tx confirmed, skip.
    const existing = await supabase
      .from("on_chain_transactions")
      .select("id, status")
      .eq("tx_hash", txHash)
      .eq("chain_id", chainId)
      .maybeSingle();

    if (!existing.error && existing.data && existing.data.status === "confirmed") {
      ignored++;
      continue;
    }

    const data = log.data;
    const topics = log.topics;
    if (!isHexString(data) || !Array.isArray(topics) || topics.length === 0 || topics.some((t) => !isHexString(t))) {
      ignored++;
      continue;
    }

    let decoded:
      | { eventName: string; args: Record<string, unknown> }
      | null = null;

    try {
      // viem's decodeEventLog typing is strict about topics tuple shape; keep runtime-correct.
      const res = decodeEventLog({
        abi: PREDICTION_MARKET_VAULT_ABI as any,
        data: data as Hex,
        topics: topics as unknown as [Hex, ...Hex[]],
      }) as unknown as { eventName: string; args?: Record<string, unknown> };
      decoded = { eventName: res.eventName, args: (res.args ?? {}) as Record<string, unknown> };
    } catch {
      // Not one of our events; ignore.
      ignored++;
      continue;
    }

    try {
      // Many of our writes require mapping wallet_address -> users.id
      const userAddress = typeof decoded.args.user === "string" ? decoded.args.user : null;
      const userWallet = userAddress ? userAddress.toLowerCase() : null;

      let userId: string | null = null;
      if (userWallet) {
        const u = await supabase
          .from("users")
          .select("id")
          .eq("wallet_address", userWallet)
          .maybeSingle();
        if (!u.error && u.data) userId = u.data.id;
      }

      const blockNumber = typeof log.blockNumber === "number" ? log.blockNumber : null;
      const metaBase = {
        webhookId: payload.webhookId ?? null,
        webhookEventId: payload.id ?? null,
        logIndex: typeof log.logIndex === "number" ? log.logIndex : null,
        rawNetwork: payload.event?.network ?? null,
      };

      // Helper to upsert on_chain_transactions (confirmed)
      const upsertTx = async (txType: any, amountMinor: string | null, assetCode: string | null, marketId: string | null, extraMeta: Record<string, unknown>) => {
        await supabase
          .from("on_chain_transactions")
          .upsert(
            {
              user_id: userId,
              tx_hash: txHash,
              chain_id: chainId,
              status: "confirmed",
              tx_type: txType,
              amount_minor: amountMinor,
              asset_code: assetCode,
              market_id: marketId,
              block_number: blockNumber,
              confirmed_at: nowIso,
              block_timestamp: nowIso,
              metadata: { ...metaBase, ...extraMeta },
            } as any,
            { onConflict: "tx_hash,chain_id" }
          );
      };

      // ============================================================
      // Event handlers
      // ============================================================
      if (decoded.eventName === "Deposited") {
        const token = String(decoded.args.token ?? "");
        const amount = BigInt(String(decoded.args.amount ?? "0"));
        const newBalance = BigInt(String(decoded.args.newBalance ?? "0"));

        const assetCode = ADDRESS_RE.test(token) ? tokenToAssetCode(chainId, token) : null;

        await upsertTx(
          "deposit",
          amount.toString(),
          assetCode,
          null,
          { event: "Deposited", token, amount: amount.toString(), newBalance: newBalance.toString() }
        );

        if (userId && assetCode) {
          // Track deposit row (idempotent by tx_hash+chain_id)
          await supabase
            .from("deposits")
            .upsert(
              {
                user_id: userId,
                tx_hash: txHash,
                chain_id: chainId,
                amount_minor: amount.toString(),
                asset_code: assetCode,
                status: "credited",
                from_address: userWallet!,
                block_number: blockNumber,
                block_timestamp: nowIso,
                credited_at: nowIso,
              } as any,
              { onConflict: "tx_hash,chain_id" }
            );

          // Sync vault-balance view for UX
          await supabase
            .from("wallet_balances")
            .upsert(
              {
                user_id: userId,
                asset_code: assetCode,
                balance_minor: newBalance.toString(),
                updated_at: nowIso,
              } as any,
              { onConflict: "user_id,asset_code" }
            );

          // Insert wallet_transactions record (best-effort idempotency via external_ref)
          const existingTx = await supabase
            .from("wallet_transactions")
            .select("id")
            .eq("user_id", userId)
            .eq("kind", "deposit")
            .eq("external_ref", txHash)
            .maybeSingle();
          if (!existingTx.error && !existingTx.data) {
            await supabase.from("wallet_transactions").insert({
              id: crypto.randomUUID(),
              user_id: userId,
              asset_code: assetCode,
              amount_minor: amount.toString(),
              kind: "deposit",
              external_ref: txHash,
              created_at: nowIso,
            } as any);
          }
        }

        processed++;
        continue;
      }

      if (decoded.eventName === "Withdrawn") {
        const token = String(decoded.args.token ?? "");
        const amount = BigInt(String(decoded.args.amount ?? "0"));
        const newBalance = BigInt(String(decoded.args.newBalance ?? "0"));
        const assetCode = ADDRESS_RE.test(token) ? tokenToAssetCode(chainId, token) : null;

        await upsertTx(
          "withdraw",
          amount.toString(),
          assetCode,
          null,
          { event: "Withdrawn", token, amount: amount.toString(), newBalance: newBalance.toString() }
        );

        if (userId && assetCode) {
          await supabase
            .from("wallet_balances")
            .upsert(
              {
                user_id: userId,
                asset_code: assetCode,
                balance_minor: newBalance.toString(),
                updated_at: nowIso,
              } as any,
              { onConflict: "user_id,asset_code" }
            );

          const existingTx = await supabase
            .from("wallet_transactions")
            .select("id")
            .eq("user_id", userId)
            .eq("kind", "withdraw")
            .eq("external_ref", txHash)
            .maybeSingle();
          if (!existingTx.error && !existingTx.data) {
            await supabase.from("wallet_transactions").insert({
              id: crypto.randomUUID(),
              user_id: userId,
              asset_code: assetCode,
              amount_minor: (-amount).toString(),
              kind: "withdraw",
              external_ref: txHash,
              created_at: nowIso,
            } as any);
          }
        }

        processed++;
        continue;
      }

      // For BetPlaced / PositionSold / WinningsClaimed we need a DB mapping
      // from on-chain marketId (bytes32) -> markets.id (uuid).
      // This supports multi-chain via market_onchain_map.
      if (decoded.eventName === "BetPlaced" || decoded.eventName === "PositionSold" || decoded.eventName === "WinningsClaimed") {
        const marketIdBytes32 = String(decoded.args.marketId ?? "");
        const outcome = typeof decoded.args.outcome === "number" ? decoded.args.outcome : Number(decoded.args.outcome ?? 0);

        let marketId: string | null = null;
        let assetCode: string | null = null;
        if (marketIdBytes32) {
          const mapRow = await supabase
            .from("market_onchain_map")
            .select("market_id")
            .eq("chain_id", chainId)
            .eq("onchain_market_id", marketIdBytes32)
            .maybeSingle();
          if (!mapRow.error && mapRow.data?.market_id) {
            marketId = String(mapRow.data.market_id);
            const marketRow = await supabase
              .from("markets")
              .select("id, settlement_asset_code")
              .eq("id", marketId)
              .maybeSingle();
            if (!marketRow.error && marketRow.data) {
              assetCode = String(marketRow.data.settlement_asset_code);
            }
          }
        }

        if (decoded.eventName === "BetPlaced") {
          const collateral = BigInt(String(decoded.args.collateral ?? "0"));
          const shares = BigInt(String(decoded.args.shares ?? "0"));
          await upsertTx("bet", collateral.toString(), assetCode, marketId, {
            event: "BetPlaced",
            marketIdBytes32,
            outcome,
            collateral: collateral.toString(),
            shares: shares.toString(),
            nonce: String(decoded.args.nonce ?? ""),
          });
          processed++;
          continue;
        }

        if (decoded.eventName === "PositionSold") {
          const payout = BigInt(String(decoded.args.payout ?? "0"));
          const shares = BigInt(String(decoded.args.shares ?? "0"));
          await upsertTx("sell", payout.toString(), assetCode, marketId, {
            event: "PositionSold",
            marketIdBytes32,
            outcome,
            payout: payout.toString(),
            shares: shares.toString(),
            nonce: String(decoded.args.nonce ?? ""),
          });
          processed++;
          continue;
        }

        if (decoded.eventName === "WinningsClaimed") {
          const payout = BigInt(String(decoded.args.payout ?? "0"));
          const shares = BigInt(String(decoded.args.shares ?? "0"));
          await upsertTx("claim", payout.toString(), assetCode, marketId, {
            event: "WinningsClaimed",
            marketIdBytes32,
            outcome,
            payout: payout.toString(),
            shares: shares.toString(),
          });
          processed++;
          continue;
        }
      }

      // MarketResolved is admin-only and affects claim eligibility; store for audit.
      if (decoded.eventName === "MarketResolved") {
        const marketIdBytes32 = String(decoded.args.marketId ?? "");
        const outcome = typeof decoded.args.outcome === "number" ? decoded.args.outcome : Number(decoded.args.outcome ?? 0);

        let marketId: string | null = null;
        let assetCode: string | null = null;
        if (marketIdBytes32) {
          const mapRow = await supabase
            .from("market_onchain_map")
            .select("market_id")
            .eq("chain_id", chainId)
            .eq("onchain_market_id", marketIdBytes32)
            .maybeSingle();
          if (!mapRow.error && mapRow.data?.market_id) {
            marketId = String(mapRow.data.market_id);
            const marketRow = await supabase
              .from("markets")
              .select("id, settlement_asset_code")
              .eq("id", marketId)
              .maybeSingle();
            if (!marketRow.error && marketRow.data) {
              assetCode = String(marketRow.data.settlement_asset_code);
            }
          }
        }

        await upsertTx("claim", null, assetCode, marketId, {
          event: "MarketResolved",
          marketIdBytes32,
          outcome,
        });
        processed++;
        continue;
      }

      ignored++;
    } catch (e) {
      errors.push({ txHash, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    ignored,
    errors: errors.slice(0, 10),
  });
}

