import {
  BrowserProvider,
  Contract,
  ZeroAddress,
  type TypedDataField,
  getAddress,
  hexlify,
  parseUnits,
  randomBytes,
} from "ethers";
import type { LimitlessTradeMeta } from "@/types";
import type { PrivyWalletLike } from "@/src/lib/polymarket/tradingClient";

const LIMITLESS_DOMAIN_NAME = "Limitless CTF Exchange";
const LIMITLESS_DOMAIN_VERSION = "1";
export const LIMITLESS_BASE_CHAIN_ID = 8453;

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

const ORDER_TYPES: Record<string, TypedDataField[]> = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
};

type BuildLimitlessSignedBuyOrderInput = {
  wallet: PrivyWalletLike;
  tradeMeta: LimitlessTradeMeta;
  side: "YES" | "NO";
  amountUsd: number;
  limitPrice: number;
  chainId?: number;
  orderType?: "FOK" | "GTC";
};

type BuildLimitlessSignedBuyOrderResult = {
  signedOrder: Record<string, string | number>;
  orderType: "FOK" | "GTC";
  priceUsed: number;
  shares: number;
  allowanceUpdated: boolean;
};

const isFinitePositive = (value: number) => Number.isFinite(value) && value > 0;

const formatFixedUnits = (value: number, decimals: number): string => {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(decimals);
};

const buildNonce = (): bigint => {
  const now = BigInt(Date.now());
  const random = BigInt(Math.floor(Math.random() * 1_000_000));
  return now * 1_000_000n + random;
};

const buildSalt = (): bigint => {
  return BigInt(hexlify(randomBytes(16)));
};

const switchToBaseChain = async (wallet: PrivyWalletLike, chainId: number) => {
  if (!wallet.getEthereumProvider) {
    throw new Error("PRIVY_ETH_PROVIDER_MISSING");
  }
  const provider = await wallet.getEthereumProvider();
  if (!provider) throw new Error("PRIVY_ETH_PROVIDER_MISSING");

  const targetHex = `0x${chainId.toString(16)}`;
  try {
    await provider.request?.({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }],
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? Number((error as { code?: unknown }).code) : NaN;
    if (code !== 4902) {
      throw error;
    }
    await provider.request?.({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: targetHex,
          chainName: "Base",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://mainnet.base.org"],
          blockExplorerUrls: ["https://basescan.org"],
        },
      ],
    });
  }
  return provider;
};

const ensureAllowance = async (params: {
  wallet: PrivyWalletLike;
  ownerAddress: string;
  tokenAddress: string;
  spenderAddress: string;
  requiredAmount: bigint;
  chainId: number;
}): Promise<boolean> => {
  const evmProvider = await switchToBaseChain(params.wallet, params.chainId);
  const browserProvider = new BrowserProvider(evmProvider);
  const signer = await browserProvider.getSigner();
  const token = new Contract(getAddress(params.tokenAddress), ERC20_ABI, signer);
  const allowance = BigInt(await token.allowance(params.ownerAddress, getAddress(params.spenderAddress)));
  if (allowance >= params.requiredAmount) return false;

  // Approve only the exact required amount instead of MaxUint256 to limit
  // exposure if the exchange contract is ever compromised.
  const tx = await token.approve(getAddress(params.spenderAddress), params.requiredAmount);
  await tx.wait();
  return true;
};

export async function buildSignedBuyOrder(
  input: BuildLimitlessSignedBuyOrderInput
): Promise<BuildLimitlessSignedBuyOrderResult> {
  if (!input.wallet.getEthereumProvider) throw new Error("PRIVY_ETH_PROVIDER_MISSING");
  if (!input.tradeMeta) throw new Error("LIMITLESS_TRADE_META_REQUIRED");
  if (!isFinitePositive(input.amountUsd)) throw new Error("AMOUNT_INVALID");
  if (!isFinitePositive(input.limitPrice)) throw new Error("PRICE_INVALID");
  if (input.limitPrice < 0.001 || input.limitPrice > 0.999) {
    throw new Error("PRICE_OUT_OF_RANGE");
  }

  const priceUsed = input.limitPrice;
  const shares = input.amountUsd / priceUsed;
  if (!isFinitePositive(shares)) throw new Error("SHARES_INVALID");

  const chainId = Number.isFinite(input.chainId) ? Number(input.chainId) : LIMITLESS_BASE_CHAIN_ID;
  const evmProvider = await switchToBaseChain(input.wallet, chainId);
  const browserProvider = new BrowserProvider(evmProvider);
  const signer = await browserProvider.getSigner();
  const makerAddress = getAddress(await signer.getAddress());
  const exchangeAddress = getAddress(input.tradeMeta.exchangeAddress);
  const collateralTokenAddress = getAddress(input.tradeMeta.collateralTokenAddress);
  const tokenId = BigInt(input.side === "NO" ? input.tradeMeta.positionIds[1] : input.tradeMeta.positionIds[0]);
  const decimals = Math.max(1, Math.trunc(input.tradeMeta.collateralTokenDecimals || 6));

  const makerAmount = parseUnits(formatFixedUnits(input.amountUsd, decimals), decimals);
  const takerAmount = parseUnits(formatFixedUnits(shares, decimals), decimals);

  const allowanceUpdated = await ensureAllowance({
    wallet: input.wallet,
    ownerAddress: makerAddress,
    tokenAddress: collateralTokenAddress,
    spenderAddress: exchangeAddress,
    requiredAmount: makerAmount,
    chainId,
  });

  const order = {
    salt: buildSalt(),
    maker: makerAddress,
    signer: makerAddress,
    taker: ZeroAddress,
    tokenId,
    makerAmount,
    takerAmount,
    expiration: 0n,
    nonce: buildNonce(),
    feeRateBps: 0n,
    side: 0,
    signatureType: 0,
  } as const;

  const signature = await signer.signTypedData(
    {
      name: LIMITLESS_DOMAIN_NAME,
      version: LIMITLESS_DOMAIN_VERSION,
      chainId,
      verifyingContract: exchangeAddress,
    },
    ORDER_TYPES,
    order
  );

  return {
    signedOrder: {
      salt: order.salt.toString(),
      maker: order.maker,
      signer: order.signer,
      taker: order.taker,
      tokenId: order.tokenId.toString(),
      makerAmount: order.makerAmount.toString(),
      takerAmount: order.takerAmount.toString(),
      expiration: order.expiration.toString(),
      nonce: order.nonce.toString(),
      feeRateBps: order.feeRateBps.toString(),
      side: order.side,
      signatureType: order.signatureType,
      signature,
    },
    orderType: input.orderType ?? "FOK",
    priceUsed,
    shares,
    allowanceUpdated,
  };
}
