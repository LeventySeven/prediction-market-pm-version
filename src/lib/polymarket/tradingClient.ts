import { BrowserProvider, type Eip1193Provider } from "ethers";
import { ClobClient, Side, type ApiKeyCreds, type SignedOrder } from "@polymarket/clob-client";

export type EphemeralApiCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

export type PrivyWalletLike = {
  address?: string;
  getEthereumProvider?: () => Promise<Eip1193Provider>;
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
  signedOrder: SignedOrder;
  apiCreds: EphemeralApiCreds;
  orderType: "FOK" | "GTC";
  priceUsed: number;
  shares: number;
};

const isFinitePositive = (value: number) => Number.isFinite(value) && value > 0;

const normalizeApiCreds = (value: Partial<ApiKeyCreds> | null | undefined): EphemeralApiCreds | null => {
  if (!value) return null;
  const key = typeof value.key === "string" ? value.key.trim() : "";
  const secret = typeof value.secret === "string" ? value.secret.trim() : "";
  const passphrase = typeof value.passphrase === "string" ? value.passphrase.trim() : "";
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
  if (input.limitPrice < 0.001 || input.limitPrice > 0.999) {
    throw new Error("PRICE_OUT_OF_RANGE");
  }

  const safePrice = input.limitPrice;
  const shares = input.amountUsd / safePrice;
  if (!isFinitePositive(shares)) throw new Error("SHARES_INVALID");

  const evmProvider = await requireEvmProvider(input.wallet);
  const ethersProvider = new BrowserProvider(evmProvider);
  const signer = await ethersProvider.getSigner();
  const signatureType = 1;
  const signerCompat = signer as never as ConstructorParameters<typeof ClobClient>[2];
  const host = input.clobUrl.replace(/\/+$/, "");
  const chainId = input.chainId as ConstructorParameters<typeof ClobClient>[1];
  const initialCreds = normalizeApiCreds(input.apiCreds);

  const baseClient = new ClobClient(
    host,
    chainId,
    signerCompat,
    initialCreds ?? undefined,
    signatureType
  );

  let apiCreds = initialCreds;
  if (!apiCreds) {
    const created = await baseClient.createOrDeriveApiKey();
    apiCreds = normalizeApiCreds(created);
  }
  if (!apiCreds) throw new Error("API_CREDS_DERIVATION_FAILED");
  const client = new ClobClient(host, chainId, signerCompat, apiCreds, signatureType);

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
    signedOrder: order,
    apiCreds,
    orderType: input.orderType ?? "FOK",
    priceUsed: safePrice,
    shares,
  };
}
