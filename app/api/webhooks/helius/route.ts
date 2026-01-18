import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database";
import type { JsonValue } from "@/src/types/database";

export const runtime = "nodejs";

type AnyObj = Record<string, JsonValue>;

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function extractTxSig(payload: AnyObj): string | null {
  // Common Helius payloads include `signature` or `transactionSignature` or nested.
  const direct = payload["signature"] ?? payload["transactionSignature"] ?? payload["txSig"] ?? payload["tx_sig"];
  if (typeof direct === "string" && direct.length > 0) return direct;

  const tx = payload["transaction"];
  if (tx && typeof tx === "object") {
    const sig = (tx as AnyObj)["signature"];
    if (typeof sig === "string" && sig.length > 0) return sig;
  }

  return null;
}

function extractUserPubkey(payload: AnyObj): string | null {
  const v =
    payload["userPubkey"] ??
    payload["walletPubkey"] ??
    payload["account"] ??
    payload["fromPubkey"] ??
    payload["from_pubkey"];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function extractMarketPda(payload: AnyObj): string | null {
  const v = payload["marketPda"] ?? payload["market_pda"] ?? payload["market"];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function POST(req: Request) {
  // Minimal-risk verification until the exact Helius signature header is configured:
  // require a shared secret header we can rotate.
  const configured = process.env.HELIUS_WEBHOOK_SECRET;
  if (configured && configured.length > 0) {
    const got = req.headers.get("x-webhook-secret") || "";
    if (got !== configured) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
  }

  const body = (await req.json().catch(() => null)) as JsonValue | null;
  const events: AnyObj[] = Array.isArray(body)
    ? (body as AnyObj[])
    : body && typeof body === "object"
      ? [body as AnyObj]
      : [];

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient<Database>(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const solanaCluster = (process.env.SOLANA_CLUSTER || process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet").toLowerCase();
  const cluster = solanaCluster === "mainnet-beta" ? "mainnet-beta" : solanaCluster === "testnet" ? "testnet" : "devnet";

  let processed = 0;
  let ignored = 0;

  for (const e of events) {
    const txSig = extractTxSig(e);
    const userPubkey = extractUserPubkey(e);
    const marketPda = extractMarketPda(e);

    if (!txSig) {
      ignored += 1;
      continue;
    }

    // Resolve user_id via users.solana_wallet_address
    let userId: string | null = null;
    if (userPubkey) {
      const { data: u } = await supabase
        .from("users")
        .select("id")
        .eq("solana_wallet_address", userPubkey)
        .maybeSingle();
      userId = u?.id ?? null;
    }

    if (!userId) {
      // Can't insert without user_id due to NOT NULL; keep it as ignored for now.
      ignored += 1;
      continue;
    }

    // Resolve market_id (optional) via market_onchain_map
    let marketId: string | null = null;
    if (marketPda) {
      const { data: m } = await supabase
        .from("market_onchain_map")
        .select("market_id")
        .eq("solana_cluster", cluster)
        .eq("market_pda", marketPda)
        .maybeSingle();
      marketId = (m as { market_id: string } | null)?.market_id ?? null;
    }

    // Upsert into on_chain_transactions as confirmed.
    // NOTE: tx_type isn't standardized yet for webhook payload mapping. Store it as 'deposit' for now.
    const row: Database["public"]["Tables"]["on_chain_transactions"]["Insert"] = {
        user_id: userId,
        solana_cluster: cluster,
        tx_sig: txSig,
        status: "confirmed",
        tx_type: "deposit",
        amount_minor: null,
        asset_code: "USDC",
        market_id: marketId,
        trade_id: null,
        nonce: null,
        gas_used: null,
        gas_price_gwei: null,
        block_number: null,
        block_timestamp: null,
        error_message: null,
        metadata: e,
      };
    await supabase.from("on_chain_transactions").upsert(row, { onConflict: "solana_cluster,tx_sig" });

    processed += 1;
  }

  return NextResponse.json({ ok: true, processed, ignored });
}

