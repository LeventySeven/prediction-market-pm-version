/**
 * Seed Supabase bets using the transactional RPC (place_bet_tx) so pools and balances stay consistent.
 * Usage (Bun):
 *  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun tsx scripts/seed-bets.ts
 *
 * Requires env vars:
 *  - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *  - SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient<Database, "public">(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type IdRow = { id: string };
type PlaceBetArgs = Database["public"]["Functions"]["place_bet_tx"]["Args"];
type PlaceBetResult = Database["public"]["Functions"]["place_bet_tx"]["Returns"];
type UserIdRow = Pick<Database["public"]["Tables"]["users"]["Row"], "id">;
type MarketIdRow = Pick<Database["public"]["Tables"]["markets"]["Row"], "id">;

type RpcResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

const callPlaceBetTx = (params: PlaceBetArgs) => {
  const rpc = supabase.rpc as unknown as (
    fn: "place_bet_tx",
    rpcParams: PlaceBetArgs
  ) => Promise<RpcResponse<PlaceBetResult>>;
  return rpc("place_bet_tx", params);
};

async function main() {
  const { data: rawUsers } = await supabase
    .from("users")
    .select("id")
    .limit(5)
    .returns<UserIdRow[]>();
  const { data: rawMarkets } = await supabase
    .from("markets")
    .select("id")
    .limit(10)
    .returns<MarketIdRow[]>();

  const users: IdRow[] = (rawUsers ?? []).map(({ id }) => ({ id }));
  const markets: IdRow[] = (rawMarkets ?? []).map(({ id }) => ({ id }));

  if (users.length === 0 || markets.length === 0) {
    console.log("No users or markets found; skipping seeding bets.");
    return;
  }

const bets: { args: PlaceBetArgs; userId: string }[] = [];
  let userIdx = 0;
  for (const market of markets) {
    const user = users[userIdx % users.length];
    userIdx++;
  bets.push({
    userId: user.id,
    args: {
      p_market_id: market.id,
      p_side: Math.random() > 0.5 ? "YES" : "NO",
      p_amount: Math.max(5, Math.round(Math.random() * 50)),
    },
  });
  }

for (const bet of bets) {
  const rpc = await callPlaceBetTx(bet.args);
    if (rpc.error) {
    console.error("Failed to place bet", bet, rpc.error);
    } else {
      console.log(
      `Bet OK: user ${bet.userId} market ${bet.args.p_market_id} side ${bet.args.p_side} amount ${bet.args.p_amount}`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

