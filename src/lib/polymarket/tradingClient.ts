import { BrowserProvider } from "ethers";
import { ClobClient, Side } from "@polymarket/clob-client";

export type EphemeralApiCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

export type PrivyWalletLike = {
  address?: string;
  getEthereumProvider?: () => Promise<unknown>;
};

export type BuildSignedBuyOrderInput = {
  wallet: PrivyWalletLike;
  tokenId: string;
  amountUsd: number;
  limitPrice: number;
  chainId: number;
  clobUrl: string;
  apiCreds?: EphemeralApiCreds | null;
  orderType?: "FOK" | "GTC";
};

export type BuildSignedBuyOrderResult = {
  signedOrder: Record<string, unknown>;
  apiCreds: EphemeralApiCreds;
  orderType: "FOK" | "GTC";
  priceUsed: number;
  shares: number;
};

const isFinitePositive = (value: number) => Number.isFinite(value) && value > 0;

const normalizeApiCreds = (value: unknown): EphemeralApiCreds | null => {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const key = typeof rec.key === "string" ? rec.key.trim() : "";
  const secret = typeof rec.secret === "string" ? rec.secret.trim() : "";
  const passphrase = typeof rec.passphrase === "string" ? rec.passphrase.trim() : "";
  if (!key || !secret || !passphrase) return null;
  return { key, secret, passphrase };
};

const requireEvmProvider = async (wallet: PrivyWalletLike) => {
  if (!wallet.getEthereumProvider) {
    throw new Error("PRIVY_ETH_PROVIDER_MISSING");
  }
  const provider = await wallet.getEthereumProvider();
  if (!provider) {
    throw new Error("PRIVY_ETH_PROVIDER_MISSING");
  }
  return provider;
};

export async function buildSignedBuyOrder(input: BuildSignedBuyOrderInput): Promise<BuildSignedBuyOrderResult> {
  const tokenId = input.tokenId.trim();
  if (!tokenId) throw new Error("TOKEN_ID_REQUIRED");
  if (!isFinitePositive(input.amountUsd)) throw new Error("AMOUNT_INVALID");
  if (!isFinitePositive(input.limitPrice)) throw new Error("PRICE_INVALID");

  const safePrice = Math.max(0.001, Math.min(0.999, input.limitPrice));
  const shares = input.amountUsd / safePrice;
  if (!isFinitePositive(shares)) throw new Error("SHARES_INVALID");

  const evmProvider = await requireEvmProvider(input.wallet);
  const ethersProvider = new BrowserProvider(evmProvider as any);
  const signer = await ethersProvider.getSigner();
  const signatureType = 1;

  const client: any = new ClobClient(
    input.clobUrl.replace(/\/+$/, ""),
    input.chainId,
    signer as any,
    undefined,
    signatureType
  );

  let apiCreds = normalizeApiCreds(input.apiCreds);
  if (!apiCreds) {
    const created = await client.createOrDeriveApiKey();
    apiCreds = normalizeApiCreds(created);
  }
  if (!apiCreds) throw new Error("API_CREDS_DERIVATION_FAILED");
  if (typeof client.setApiCreds === "function") {
    client.setApiCreds(apiCreds);
  }

  const order = await client.createOrder({
    tokenID: tokenId,
    price: safePrice,
    size: shares,
    side: Side.BUY,
  });
  if (!order || typeof order !== "object" || Array.isArray(order)) {
    throw new Error("SIGNED_ORDER_INVALID");
  }

  return {
    signedOrder: order as Record<string, unknown>,
    apiCreds,
    orderType: input.orderType ?? "FOK",
    priceUsed: safePrice,
    shares,
  };
}
