import { PrivyClient } from "@privy-io/server-auth";

type PrivyLinkedAccount = {
  type?: string;
  chain_type?: string;
  address?: string;
  wallet_client_type?: string;
};

export type VerifiedPrivyIdentity = {
  privyUserId: string;
  walletAddress: string | null;
  email: string | null;
};

let privyClient: PrivyClient | null = null;

const getPrivyClient = () => {
  if (privyClient) return privyClient;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("PRIVY_CONFIG_MISSING");
  }
  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
};

const normalizeAddress = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
};

const pickPrimaryEvmWalletAddress = (accounts: unknown): string | null => {
  if (!Array.isArray(accounts)) return null;
  const typed = accounts as PrivyLinkedAccount[];
  const evmWallet =
    typed.find((a) => a.type === "wallet" && (a.chain_type ?? "").toLowerCase() === "ethereum" && a.wallet_client_type === "privy") ??
    typed.find((a) => a.type === "wallet" && (a.chain_type ?? "").toLowerCase() === "ethereum") ??
    typed.find((a) => a.type === "wallet");
  return normalizeAddress(evmWallet?.address);
};

export async function verifyPrivyAccessToken(accessToken: string): Promise<VerifiedPrivyIdentity> {
  const token = accessToken.trim();
  if (!token) throw new Error("PRIVY_ACCESS_TOKEN_MISSING");
  const client = getPrivyClient();
  const claims = await client.verifyAuthToken(token);
  const userId = String((claims as { userId?: string }).userId ?? "").trim();
  if (!userId) throw new Error("PRIVY_USER_ID_MISSING");

  const user = await client.getUser(userId);
  const userRec = user as { linkedAccounts?: unknown; email?: { address?: string } | null };
  const walletAddress = pickPrimaryEvmWalletAddress(userRec?.linkedAccounts);
  const email =
    typeof userRec?.email?.address === "string" && userRec.email.address.trim().length > 0
      ? userRec.email.address.trim().toLowerCase()
      : null;

  return {
    privyUserId: userId,
    walletAddress,
    email,
  };
}
