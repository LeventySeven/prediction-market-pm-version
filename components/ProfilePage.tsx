'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Mail, User as UserIcon, Shield, Pencil, X, Image, CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight, Clock, Wallet } from 'lucide-react';
import Button from './Button';
import type { Bet, Market, Trade, User, UserCommentSummary } from '../types';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useChainId, usePublicClient, useWalletClient } from 'wagmi';
import type { Hex } from 'viem';
import { trpcClient } from '@/src/utils/trpcClient';
import { ERC20_ABI, PREDICTION_MARKET_VAULT_ABI } from '@/lib/contracts/abis';
import { getChainName, getContractAddresses } from '@/lib/contracts/addresses';

type ProfilePageProps = {
  user: User | null;
  lang: 'RU' | 'EN';
  onLogin: () => void;
  onLogout: () => void;
  onUpdateDisplayName: (nextDisplayName: string) => Promise<void>;
  onUpdateAvatarUrl: (nextAvatarUrl: string | null) => Promise<void>;
  balanceMajor: number;
  pnlMajor: number;
  bets: Bet[];
  betsLoading?: boolean;
  betsError?: string | null;
  soldTrades: Trade[];
  comments: UserCommentSummary[];
  commentsLoading?: boolean;
  commentsError?: string | null;
  bookmarks: Market[];
  onMarketClick: (marketId: string) => void;
  onLoadBets?: () => void;
  onLoadComments?: () => void;
};

const initialsFrom = (value?: string) => {
  const v = (value ?? '').trim();
  if (!v) return '?';
  const parts = v.split(/[\s._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? v[0];
  const b = parts[1]?.[0] ?? v[1] ?? '';
  return `${a}${b}`.toUpperCase();
};

const formatDate = (iso?: string, lang: 'RU' | 'EN' = 'RU') => {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'RU' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
};

const hashStringToInt = (value: string) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const accentPairFromSeed = (seed: string) => {
  const h = hashStringToInt(seed);
  const hueA = h % 360;
  const hueB = (hueA + 32 + ((h >> 8) % 48)) % 360;
  return {
    a: `hsla(${hueA}, 85%, 58%, 0.20)`,
    b: `hsla(${hueB}, 85%, 58%, 0.16)`,
    edgeA: `hsla(${hueA}, 85%, 58%, 0.75)`,
    edgeB: `hsla(${hueB}, 85%, 58%, 0.65)`,
  };
};

const accentPairFromHue = (hueA: number) => {
  const hueB = (hueA + 28) % 360;
  return {
    a: `hsla(${hueA}, 85%, 58%, 0.20)`,
    b: `hsla(${hueB}, 85%, 58%, 0.16)`,
    edgeA: `hsla(${hueA}, 85%, 58%, 0.75)`,
    edgeB: `hsla(${hueB}, 85%, 58%, 0.65)`,
  };
};

const hueFromRgb = (r: number, g: number, b: number) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d < 1e-9) return 0;
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
};

const sampleAvatarHue = async (src: string): Promise<number | null> => {
  try {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";

    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("AVATAR_LOAD_FAILED"));
    });

    img.src = src;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const r = data[0] ?? 0;
    const g = data[1] ?? 0;
    const b = data[2] ?? 0;
    return hueFromRgb(r, g, b);
  } catch {
    // If the image is cross-origin without CORS, canvas read will fail (tainted).
    return null;
  }
};

const WalletConnectSection: React.FC<{ lang: 'RU' | 'EN' }> = ({ lang }) => {
  const { open } = useAppKit();
  const { address, isConnected, status } = useAppKitAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [walletBalMajor, setWalletBalMajor] = useState<number | null>(null);
  const [vaultBalMajor, setVaultBalMajor] = useState<number | null>(null);
  const [fundsError, setFundsError] = useState<string | null>(null);
  const [fundsBusy, setFundsBusy] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amountDraft, setAmountDraft] = useState<string>('');

  const handleConnectClick = () => {
    try {
      open({ view: 'Connect' });
    } catch (error) {
      console.error('Failed to open wallet modal:', error);
    }
  };

  const handleDisconnectClick = async () => {
    try {
      open({ view: 'Account' });
      // Disconnect will be handled through the Account view
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const isConnecting = status === 'connecting' || status === 'reconnecting';
  const chainLabel = getChainName(chainId);

  const refreshBalances = useCallback(async () => {
    if (!isConnected || !address) return;
    const addrs = getContractAddresses(chainId);
    const vault = addrs?.vault;
    const usdc = addrs?.usdc;
    if (!vault || !usdc) return;
    if (vault === '0x0000000000000000000000000000000000000000') return;
    if (usdc === '0x0000000000000000000000000000000000000000') return;

    try {
      setFundsError(null);
      const decimals = 6;
      const [walletBal, vaultBal] = await Promise.all([
        (publicClient as any).readContract({
          address: usdc,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }) as Promise<bigint>,
        (publicClient as any).readContract({
          address: vault,
          abi: PREDICTION_MARKET_VAULT_ABI,
          functionName: 'getBalance',
          args: [address, usdc],
        }) as Promise<bigint>,
      ]);
      setWalletBalMajor(Number(walletBal) / Math.pow(10, decimals));
      setVaultBalMajor(Number(vaultBal) / Math.pow(10, decimals));
    } catch (e) {
      setFundsError(lang === 'RU' ? 'Не удалось загрузить балансы' : 'Failed to load balances');
    }
  }, [address, chainId, isConnected, publicClient, lang]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  const parseAmount = () => {
    const normalized = amountDraft.replace(',', '.').trim();
    const v = Number(normalized);
    return Number.isFinite(v) && v > 0 ? v : null;
  };

  const handleDeposit = async () => {
    const amount = parseAmount();
    if (!amount) {
      setFundsError(lang === 'RU' ? 'Введите сумму' : 'Enter an amount');
      return;
    }
    if (!walletClient || !address) {
      setFundsError(lang === 'RU' ? 'Кошелек недоступен' : 'Wallet unavailable');
      return;
    }
    setFundsBusy(true);
    setFundsError(null);
    try {
      const prep = await trpcClient.wallet.prepareDeposit.mutate({ assetCode: 'USDC', amount });
      // Viem/Wagmi types can require extra fields (e.g. `kzg`) depending on version.
      // Keep runtime-correct transaction shape and avoid blocking builds on upstream typing changes.
      const approveHash = await (walletClient as any).sendTransaction({
        account: walletClient.account!,
        to: prep.approveTx.to as `0x${string}`,
        data: prep.approveTx.data as Hex,
        value: BigInt(prep.approveTx.value || '0'),
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      const depositHash = await (walletClient as any).sendTransaction({
        account: walletClient.account!,
        to: prep.depositTx.to as `0x${string}`,
        data: prep.depositTx.data as Hex,
        value: BigInt(prep.depositTx.value || '0'),
      });
      await publicClient.waitForTransactionReceipt({ hash: depositHash });

      setDepositOpen(false);
      setAmountDraft('');
      await refreshBalances();
    } catch (e) {
      console.error('deposit failed', e);
      setFundsError(lang === 'RU' ? 'Не удалось выполнить депозит' : 'Deposit failed');
    } finally {
      setFundsBusy(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseAmount();
    if (!amount) {
      setFundsError(lang === 'RU' ? 'Введите сумму' : 'Enter an amount');
      return;
    }
    if (!walletClient || !address) {
      setFundsError(lang === 'RU' ? 'Кошелек недоступен' : 'Wallet unavailable');
      return;
    }
    setFundsBusy(true);
    setFundsError(null);
    try {
      const prep = await trpcClient.wallet.prepareWithdraw.mutate({ assetCode: 'USDC', amount });
      const withdrawHash = await (walletClient as any).sendTransaction({
        account: walletClient.account!,
        to: prep.withdrawTx.to as `0x${string}`,
        data: prep.withdrawTx.data as Hex,
        value: BigInt(prep.withdrawTx.value || '0'),
      });
      await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
      setWithdrawOpen(false);
      setAmountDraft('');
      await refreshBalances();
    } catch (e) {
      console.error('withdraw failed', e);
      setFundsError(lang === 'RU' ? 'Не удалось вывести средства' : 'Withdraw failed');
    } finally {
      setFundsBusy(false);
    }
  };

  return (
    <div className="mt-4 border border-zinc-900 bg-black rounded-2xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full border border-zinc-900 bg-zinc-950/40 flex items-center justify-center">
            <Wallet size={18} className="text-zinc-400" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
              {lang === 'RU' ? 'WalletConnect' : 'WalletConnect'}
            </div>
            {isConnected && address ? (
              <div className="space-y-1">
                <div className="text-sm font-mono text-zinc-300">{truncateAddress(address)}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {chainLabel}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {lang === 'RU' ? 'USDC (кошелек):' : 'USDC (wallet):'}{' '}
                  <span className="font-mono text-zinc-200">{walletBalMajor === null ? '—' : walletBalMajor.toFixed(2)}</span>
                  {' • '}
                  {lang === 'RU' ? 'Vault:' : 'Vault:'}{' '}
                  <span className="font-mono text-zinc-200">{vaultBalMajor === null ? '—' : vaultBalMajor.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">
                {lang === 'RU' ? 'Не подключен' : 'Not connected'}
              </div>
            )}
          </div>
        </div>
        <div>
          {isConnected && address ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
              onClick={handleDisconnectClick}
              disabled={isConnecting}
            >
              {isConnecting
                ? lang === 'RU'
                  ? 'Отключение...'
                  : 'Disconnecting...'
                : lang === 'RU'
                ? 'Отключить'
                : 'Disconnect'}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              className="h-9 px-4 rounded-full"
              onClick={handleConnectClick}
              disabled={isConnecting}
            >
              {isConnecting
                ? lang === 'RU'
                  ? 'Подключение...'
                  : 'Connecting...'
                : lang === 'RU'
                ? 'Подключить'
                : 'Connect Wallet'}
            </Button>
          )}
        </div>
      </div>

      {isConnected && address && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            fullWidth
            variant="primary"
            className="h-10 rounded-full"
            onClick={() => {
              setFundsError(null);
              setDepositOpen(true);
              setWithdrawOpen(false);
            }}
            disabled={fundsBusy}
          >
            {lang === 'RU' ? 'Депозит USDC' : 'Deposit USDC'}
          </Button>
          <Button
            fullWidth
            variant="outline"
            className="h-10 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
            onClick={() => {
              setFundsError(null);
              setWithdrawOpen(true);
              setDepositOpen(false);
            }}
            disabled={fundsBusy}
          >
            {lang === 'RU' ? 'Вывести USDC' : 'Withdraw USDC'}
          </Button>
        </div>
      )}

      {fundsError && <div className="mt-3 text-xs text-[rgba(245,68,166,1)]">{fundsError}</div>}

      {(depositOpen || withdrawOpen) && (
        <div className="mt-4 rounded-2xl border border-zinc-900 bg-zinc-950/30 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {depositOpen ? (lang === 'RU' ? 'Депозит в Vault' : 'Deposit into Vault') : (lang === 'RU' ? 'Вывод из Vault' : 'Withdraw from Vault')}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="flex-1 h-11 rounded-full bg-zinc-950 border border-zinc-900 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
            />
            <Button
              className="h-11 rounded-full px-5"
              onClick={() => void (depositOpen ? handleDeposit() : handleWithdraw())}
              disabled={fundsBusy}
            >
              {fundsBusy ? (lang === 'RU' ? 'Подождите…' : 'Please wait…') : (depositOpen ? (lang === 'RU' ? 'Пополнить' : 'Deposit') : (lang === 'RU' ? 'Вывести' : 'Withdraw'))}
            </Button>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-200"
              onClick={() => {
                setDepositOpen(false);
                setWithdrawOpen(false);
                setAmountDraft('');
              }}
              disabled={fundsBusy}
            >
              {lang === 'RU' ? 'Закрыть' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const buildSparklinePath = (values: number[]) => {
  // viewBox: 0 0 100 40
  const W = 100;
  const H = 40;
  const P = 2; // padding
  const n = values.length;
  if (n === 0) {
    return { lineD: "", areaD: "" };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);

  const toX = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const toY = (v: number) => {
    const t = (v - min) / span;
    // invert Y (0 is top)
    return P + (1 - t) * (H - P * 2);
  };

  const points = values.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const areaD = `${lineD} L ${points[points.length - 1].x.toFixed(2)} ${(H - P).toFixed(2)} L ${points[0].x.toFixed(2)} ${(H - P).toFixed(2)} Z`;
  return { lineD, areaD };
};

const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  lang,
  onLogin,
  onLogout,
  onUpdateDisplayName,
  onUpdateAvatarUrl,
  balanceMajor,
  pnlMajor,
  bets,
  betsLoading = false,
  betsError = null,
  soldTrades,
  comments,
  commentsLoading = false,
  commentsError = null,
  bookmarks,
  onMarketClick,
  onLoadBets,
  onLoadComments,
}) => {
  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 pb-32 pb-safe">
        <div className="border border-zinc-900 bg-black rounded-2xl p-6 text-center">
          <div className="mx-auto h-14 w-14 rounded-full border border-zinc-900 bg-zinc-950/40 flex items-center justify-center text-zinc-400">
            <UserIcon size={22} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-100">
            {lang === 'RU' ? 'Профиль недоступен' : 'Profile locked'}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {lang === 'RU' ? 'Войдите, чтобы увидеть профиль' : 'Log in to view your profile'}
          </p>
          <div className="mt-6 flex justify-center">
            <Button onClick={onLogin}>{lang === 'RU' ? 'Войти' : 'Log in'}</Button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = user.name ?? user.username ?? (lang === 'RU' ? 'Пользователь' : 'User');
  const handle = user.username ? `@${user.username}` : null;
  const joined = formatDate(user.createdAt, lang);
  const pnlIsPositive = (pnlMajor ?? 0) >= 0;
  const isTelegramPlaceholderEmail = (email?: string) =>
    Boolean(email && email.trim().toLowerCase().endsWith('@telegram.local'));
  const yesLabel = lang === 'RU' ? 'Да' : 'Yes';
  const noLabel = lang === 'RU' ? 'Нет' : 'No';
  const [isEditing, setIsEditing] = useState(false);
  // Tabs are "closed" by default: user chooses what to open.
  const [activeTab, setActiveTab] = useState<'BETS' | 'COMMENTS' | 'BOOKMARKS' | null>(null);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [avatarMode, setAvatarMode] = useState<'unchanged' | 'upload' | 'import_telegram' | 'clear'>('unchanged');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const activeBets = bets.filter((b) => b.status === 'open');
  const settledBets = bets.filter((b) => b.status !== 'open');

  const formatMoney = (value: number) => `$${value.toFixed(2)}`;
  const formatPct = (value: number) => `${value.toFixed(1)}%`;
  const formatSignedMoney = (value: number) => `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;

  const accentSeed = String(user.avatarUrl ?? user.telegramPhotoUrl ?? user.id ?? displayName);
  const [accent, setAccent] = useState(() => accentPairFromSeed(accentSeed));
  const avatarForAccent = avatarPreviewUrl ?? user.avatar ?? null;

  useEffect(() => {
    const src = typeof avatarForAccent === "string" && avatarForAccent.trim().length > 0 ? avatarForAccent : null;
    if (!src) {
      setAccent(accentPairFromSeed(accentSeed));
      return;
    }

    let cancelled = false;
    void (async () => {
      const hue = await sampleAvatarHue(src);
      if (cancelled) return;
      setAccent(hue === null ? accentPairFromSeed(accentSeed) : accentPairFromHue(hue));
    })();

    return () => {
      cancelled = true;
    };
  }, [avatarForAccent, accentSeed]);

  const pnlSparkline = useMemo(() => {
    const trades = [...soldTrades].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let cum = 0;
    const values = trades.map((t) => {
      cum += Number(t.realizedPnl ?? 0);
      return cum;
    });
    // If no sells yet, show a flat line.
    const series = values.length > 1 ? values : [0, 0];
    return buildSparklinePath(series);
  }, [soldTrades]);

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-32 pb-safe animate-in fade-in duration-300">
      {/* Profile header */}
      <div
        className="relative overflow-hidden border border-zinc-900 bg-black rounded-2xl p-5"
        style={{
          backgroundImage: `radial-gradient(700px 220px at 0% 0%, ${accent.a}, transparent 60%), radial-gradient(520px 180px at 100% 0%, ${accent.b}, transparent 55%)`,
        }}
      >
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-zinc-950/40 border border-zinc-900 overflow-hidden flex items-center justify-center text-zinc-100 font-bold">
            {avatarPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreviewUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              initialsFrom(displayName)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-zinc-100 truncate">{displayName}</h1>
              <button
                type="button"
                onClick={() => {
                  setEditError(null);
                  setNameDraft(displayName);
                  setAvatarMode('unchanged');
                  setAvatarFile(null);
                  setIsEditing(true);
                }}
                className="h-8 w-8 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 transition-colors flex items-center justify-center text-zinc-300"
                title={lang === 'RU' ? 'Редактировать профиль' : 'Edit profile'}
              >
                <Pencil size={14} />
              </button>
              {user.isAdmin && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border border-zinc-900 bg-zinc-950/40 text-zinc-200">
                  <Shield size={12} />
                  {lang === 'RU' ? 'Админ' : 'Admin'}
                </span>
              )}
            </div>
            {handle && <div className="text-sm text-zinc-500 truncate">{handle}</div>}
            <div className="mt-2 space-y-1 text-sm text-zinc-400">
              {user.email && !isTelegramPlaceholderEmail(user.email) && (
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-zinc-600" />
                  <span className="truncate">{user.email}</span>
                </div>
              )}
              {joined && (
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                  {lang === 'RU' ? 'Создан' : 'Joined'}: {joined}
                </div>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            onClick={onLogout}
            className="h-9 px-3 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
            title={lang === 'RU' ? 'Выйти' : 'Log out'}
          >
            <span className="sr-only">{lang === 'RU' ? 'Выйти' : 'Log out'}</span>
            <LogOut size={16} />
          </Button>
        </div>

        {/* Full-width edit panel (better alignment on mobile/miniapp) */}
        {isEditing && (
          <div className="mt-4 w-full border border-zinc-900 bg-zinc-950/30 rounded-2xl p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  {lang === 'RU' ? 'Никнейм' : 'Nickname'}
                </div>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder={lang === 'RU' ? 'Никнейм' : 'Display name'}
                  className="w-full h-11 rounded-full bg-zinc-950 border border-zinc-900 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                />
              </div>

              <div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  {lang === 'RU' ? 'Аватар' : 'Avatar'}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setAvatarFile(f);
                    setAvatarMode(f ? 'upload' : 'unchanged');
                  }}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button
                    fullWidth
                    variant="outline"
                    className="h-11 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Image size={14} />
                      {lang === 'RU' ? 'Загрузить фото' : 'Upload photo'}
                    </span>
                  </Button>
                  <Button
                    fullWidth
                    variant="outline"
                    className="h-11 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarMode('import_telegram');
                    }}
                    disabled={saving || !user.telegramPhotoUrl}
                    title={
                      user.telegramPhotoUrl
                        ? undefined
                        : lang === 'RU'
                        ? 'Нет аватара в Telegram'
                        : 'No Telegram avatar'
                    }
                  >
                    {lang === 'RU' ? 'Импорт из Telegram' : 'Import from Telegram'}
                  </Button>
                  <Button
                    fullWidth
                    variant="ghost"
                    className="h-11 rounded-full"
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarMode('clear');
                    }}
                    disabled={saving}
                  >
                    {lang === 'RU' ? 'Сбросить' : 'Reset'}
                  </Button>
                </div>

                {avatarFile && (
                  <div className="mt-2 text-xs text-zinc-500">
                    {lang === 'RU' ? 'Выбран файл:' : 'Selected file:'} {avatarFile.name}
                  </div>
                )}
                {avatarMode === 'import_telegram' && (
                  <div className="mt-2 text-xs text-zinc-500">
                    {lang === 'RU' ? 'Будет использован аватар из Telegram' : 'Will use your Telegram avatar'}
                  </div>
                )}
                {avatarMode === 'clear' && (
                  <div className="mt-2 text-xs text-zinc-500">
                    {lang === 'RU' ? 'Аватар будет сброшен' : 'Avatar will be cleared'}
                  </div>
                )}
              </div>

              {editError && <div className="text-xs text-[rgba(245,68,166,1)]">{editError}</div>}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  fullWidth
                  className="h-11 rounded-full"
                  disabled={saving}
                  onClick={async () => {
                    setEditError(null);
                    const nextName = nameDraft.trim();
                    if (nextName.length < 2) {
                      setEditError(lang === 'RU' ? 'Слишком короткий ник' : 'Name is too short');
                      return;
                    }

                    setSaving(true);
                    try {
                      if (nextName !== displayName) {
                        await onUpdateDisplayName(nextName);
                      }

                      if (avatarMode === 'upload' && avatarFile) {
                        const fd = new FormData();
                        fd.append('file', avatarFile);
                        const resp = await fetch('/api/avatar/upload', { method: 'POST', body: fd });
                        const data = (await resp.json()) as { avatarUrl?: string; error?: string };
                        if (!resp.ok || !data.avatarUrl) {
                          throw new Error(data.error || 'UPLOAD_FAILED');
                        }
                        await onUpdateAvatarUrl(data.avatarUrl);
                      } else if (avatarMode === 'import_telegram') {
                        if (!user.telegramPhotoUrl) {
                          throw new Error('NO_TELEGRAM_AVATAR');
                        }
                        await onUpdateAvatarUrl(user.telegramPhotoUrl);
                      } else if (avatarMode === 'clear') {
                        await onUpdateAvatarUrl(null);
                      }

                      setIsEditing(false);
                      setAvatarFile(null);
                      setAvatarMode('unchanged');
                    } catch {
                      setEditError(lang === 'RU' ? 'Не удалось сохранить' : 'Failed to save');
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? (lang === 'RU' ? 'Сохранение…' : 'Saving…') : (lang === 'RU' ? 'Сохранить' : 'Save')}
                </Button>
                <Button
                  fullWidth
                  variant="outline"
                  className="h-11 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
                  disabled={saving}
                  onClick={() => {
                    setEditError(null);
                    setIsEditing(false);
                    setAvatarFile(null);
                    setAvatarMode('unchanged');
                  }}
                >
                  {lang === 'RU' ? 'Отмена' : 'Cancel'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* WalletConnect Connection */}
      <WalletConnectSection lang={lang} />

      {/* PnL graph (lightweight sparkline) */}
      <div className="mt-4 border border-zinc-900 bg-black rounded-2xl overflow-hidden">
        <div className="relative p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                {lang === "RU" ? "Прибыль / Убыток" : "Profit / Loss"}
              </div>
              <div className="mt-1 text-2xl font-mono font-bold text-[rgba(245,68,166,1)]">
                {formatSignedMoney(pnlMajor)}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
                {lang === "RU" ? "За всё время" : "All-time"}
              </div>
            </div>
            <div className="shrink-0 rounded-full border border-zinc-900 bg-zinc-950/40 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              ALL
            </div>
          </div>

          <svg viewBox="0 0 100 40" className="mt-4 h-16 w-full">
            {pnlSparkline.lineD && (
              <path
                d={pnlSparkline.lineD}
                fill="none"
                stroke={"rgba(245,68,166,1)"}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </svg>
        </div>
      </div>

      {/* Balance + PnL */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="border border-zinc-900 bg-black rounded-2xl p-4">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
            {lang === 'RU' ? 'Баланс' : 'Balance'}
          </div>
          <div className="text-2xl font-mono font-bold text-zinc-100">
            {formatMoney(balanceMajor)}
          </div>
        </div>
        <div className="border border-zinc-900 bg-black rounded-2xl p-4">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
            PnL
          </div>
          <div
            className={`text-2xl font-mono font-bold ${
              pnlIsPositive ? 'text-[rgba(245,68,166,1)]' : 'text-[rgba(245,68,166,1)]'
            }`}
          >
            {pnlIsPositive ? '+' : '-'}${Math.abs(pnlMajor).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-zinc-900 flex">
        <button
          type="button"
          onClick={() => {
            if (!user) {
              onLogin();
              return;
            }
            // Only reload if tab is changing (not already on BETS tab)
            if (activeTab !== 'BETS') {
              onLoadBets?.();
            }
            setActiveTab('BETS');
          }}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'BETS' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-white'
          }`}
        >
          {lang === 'RU' ? 'Ставки' : 'Bets'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!user) {
              onLogin();
              return;
            }
            onLoadComments?.();
            setActiveTab('COMMENTS');
          }}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'COMMENTS' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-white'
          }`}
        >
          {lang === 'RU' ? 'Комментарии' : 'Comments'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!user) {
              onLogin();
              return;
            }
            // Bookmarks are loaded together with bets (myBookmarks) in HomePage.
            onLoadBets?.();
            setActiveTab('BOOKMARKS');
          }}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'BOOKMARKS' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-white'
          }`}
        >
          {lang === 'RU' ? 'Закладки' : 'Bookmarks'}
        </button>
      </div>

      {/* Transactions (bet history) */}
      <div className="mt-8">
        {activeTab === null && (
          <div className="text-sm text-zinc-500 px-1">
            {lang === 'RU' ? 'Выберите раздел выше' : 'Choose a section above'}
          </div>
        )}
        {activeTab === 'BETS' && (
          <>
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 px-1">
              {lang === 'RU' ? 'События' : 'Events'}
            </h2>
            {betsLoading && (
              <div className="text-sm text-zinc-500 px-1 mb-4">
                {lang === 'RU' ? 'Загрузка...' : 'Loading...'}
              </div>
            )}
            {betsError && (
              <div className="text-sm text-red-400 px-1 mb-4">
                {betsError}
              </div>
            )}

            {/* Active */}
            <div className="mb-6">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">
                {lang === 'RU' ? 'Текущие' : 'Ongoing'}
              </div>
              {activeBets.length === 0 ? (
                <div className="text-sm text-zinc-500 px-1">
                  {lang === 'RU' ? 'Нет активных ставок' : 'No active bets'}
                </div>
              ) : (
                <div className="space-y-3">
                  {activeBets.map((b) => {
                    const title = (lang === 'RU' ? b.marketTitleRu : b.marketTitleEn) || b.marketTitle;
                    const sideLabel = b.side === 'YES' ? yesLabel : noLabel;
                    const sideColor = b.side === 'YES' ? 'text-[rgba(245,68,166,1)]' : 'text-[rgba(245,68,166,1)]';
                    const shares = Number(b.shares ?? 0);
                    const entry = Number(b.priceAtBet ?? 0);
                    const currentPrice = b.side === 'YES' ? Number(b.priceYes ?? 0) : Number(b.priceNo ?? 0);
                    const cost = Number(b.amount ?? 0);
                    const currentValue = shares * currentPrice;
                    const pnl = currentValue - cost;
                    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
                    const pnlPositive = pnl >= 0;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                        onClick={() => onMarketClick(b.marketId)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                            <div className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
                              <span className={`font-semibold ${sideColor}`}>{sideLabel}</span>
                              <span className="text-zinc-600">•</span>
                              <span className="font-mono text-zinc-300">
                                {lang === 'RU' ? 'Куплено на' : 'Bought for'} {formatMoney(b.amount)}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-500 font-mono">
                              {shares.toFixed(1)} {lang === 'RU' ? 'акций' : 'shares'} @ {(entry * 100).toFixed(0)}¢
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-mono font-semibold text-zinc-100">{formatMoney(currentValue)}</div>
                            <div className={`mt-0.5 text-[11px] font-mono ${pnlPositive ? 'text-[rgba(245,68,166,1)]' : 'text-[rgba(245,68,166,1)]'}`}>
                              {formatSignedMoney(pnl)} ({pnlPositive ? '+' : '-'}
                              {formatPct(Math.abs(pnlPct))})
                            </div>
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-zinc-900 bg-zinc-950/40">
                                <Clock size={10} className="text-zinc-400" />
                              </span>
                              {lang === 'RU' ? 'Текущая' : 'Ongoing'}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Completed */}
            <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">
            {lang === 'RU' ? 'Завершенные' : 'Completed'}
          </div>

          {(settledBets.length === 0 && soldTrades.length === 0) ? (
            <div className="text-sm text-zinc-500 px-1">
              {lang === 'RU' ? 'Нет завершенных ставок' : 'No completed bets'}
            </div>
          ) : (
            <div className="space-y-3">
              {settledBets.map((b) => {
                const title = (lang === 'RU' ? b.marketTitleRu : b.marketTitleEn) || b.marketTitle;
                const won = b.status === 'won';
                const resultLabel = lang === 'RU' ? (won ? 'ВЫИГРЫШ' : 'ПОТЕРЯ') : (won ? 'WON' : 'LOST');
                const resultColor = won ? 'text-[rgba(245,68,166,1)]' : 'text-[rgba(245,68,166,1)]';
                const redeem = Number(b.payout ?? 0);
                const cost = Number(b.amount ?? 0);
                const pnl = redeem - cost;
                const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                    onClick={() => onMarketClick(b.marketId)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          <span className="font-mono text-zinc-300">
                            {lang === 'RU' ? 'Куплено на' : 'Bought for'} {formatMoney(b.amount)}
                          </span>
                          <span className="text-zinc-600"> → </span>
                          <span className="font-mono text-zinc-300">
                            {lang === 'RU' ? 'Погашено на' : 'Redeemed for'} {formatMoney(redeem)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-mono font-semibold text-zinc-100">{formatMoney(redeem)}</div>
                        <div className={`mt-0.5 text-[11px] font-mono ${won ? 'text-[rgba(245,68,166,1)]' : 'text-[rgba(245,68,166,1)]'}`}>
                          {formatSignedMoney(pnl)} ({pnl >= 0 ? '+' : '-'}
                          {formatPct(Math.abs(pnlPct))})
                        </div>
                        <div className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${resultColor}`}>
                          {won ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {resultLabel}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}

              {soldTrades.map((t) => {
                const title = t.marketTitleRu || t.marketTitleEn || t.marketId;
                const sharesSold = Math.abs(t.sharesDelta);
                const avgEntry = t.avgEntryPrice ?? null;
                const boughtFor = avgEntry !== null ? avgEntry * sharesSold : null;
                const soldFor = Math.abs(t.collateralNet);
                const pnl = boughtFor !== null ? soldFor - boughtFor : null;
                const pnlPct = boughtFor && boughtFor > 0 && pnl !== null ? (pnl / boughtFor) * 100 : null;
                const sideLabel = t.outcome === 'YES' ? yesLabel : noLabel;
                const sideColor = t.outcome === 'YES' ? 'text-[rgba(245,68,166,1)]' : 'text-[rgba(245,68,166,1)]';
                const resolvedOutcome = t.marketOutcome ? String(t.marketOutcome) : null;
                const outcomeText =
                  resolvedOutcome === 'YES' ? yesLabel : resolvedOutcome === 'NO' ? noLabel : null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                    onClick={() => onMarketClick(t.marketId)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                        <div className="mt-1 text-xs text-zinc-500 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${sideColor}`}>{sideLabel}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="font-mono text-zinc-300">
                              {lang === 'RU' ? 'Куплено на' : 'Bought for'}{' '}
                              {boughtFor !== null ? formatMoney(boughtFor) : '—'}
                            </span>
                            <span className="text-zinc-600"> → </span>
                            <span className="font-mono text-zinc-300">
                              {lang === 'RU' ? 'Продано за' : 'Sold for'} {formatMoney(soldFor)}
                            </span>
                          </div>
                          {outcomeText && (
                            <div className="text-[11px] text-zinc-500">
                              {lang === 'RU' ? 'Исход события' : 'Event outcome'}: {outcomeText}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-mono font-semibold text-zinc-100">{formatMoney(soldFor)}</div>
                        {pnl !== null ? (
                          <div className={`mt-0.5 text-[11px] font-mono ${pnl >= 0 ? 'text-[rgba(245,68,166,1)]' : 'text-[rgba(245,68,166,1)]'}`}>
                            {formatSignedMoney(pnl)} ({pnl >= 0 ? '+' : '-'}
                            {formatPct(Math.abs(pnlPct ?? 0))})
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[11px] font-mono text-zinc-500">—</div>
                        )}
                        <div className="mt-1 inline-flex items-center justify-end gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                          {pnl !== null ? (pnl >= 0 ? <ArrowUpRight size={12} className="text-[rgba(245,68,166,1)]" /> : <ArrowDownRight size={12} className="text-[rgba(245,68,166,1)]" />) : null}
                          {lang === 'RU' ? 'Продано' : 'Sold'}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
            </div>
          </>
        )}

        {activeTab === 'COMMENTS' && (
          <div>
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 px-1">
              {lang === 'RU' ? 'Ваши комментарии' : 'Your comments'}
            </h2>
            {commentsLoading && (
              <div className="text-sm text-zinc-500 px-1 mb-4">
                {lang === 'RU' ? 'Загрузка...' : 'Loading...'}
              </div>
            )}
            {commentsError && (
              <div className="text-sm text-red-400 px-1 mb-4">
                {commentsError}
              </div>
            )}
            {comments.length === 0 ? (
              <div className="text-sm text-zinc-500 px-1">
                {lang === 'RU' ? 'Пока нет комментариев' : 'No comments yet'}
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => {
                  const title = (lang === 'RU' ? c.marketTitleRu : c.marketTitleEn) || c.marketId;
                  const when = new Date(c.createdAt).toLocaleString(lang === 'RU' ? 'ru-RU' : 'en-US', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                      onClick={() => onMarketClick(c.marketId)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                          <div className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
                            <span className="uppercase tracking-wider text-[10px]">{when}</span>
                            {c.parentId && (
                              <>
                                <span className="text-zinc-600">•</span>
                                <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                                  {lang === 'RU' ? 'Ответ' : 'Reply'}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="mt-2 text-sm text-zinc-300 line-clamp-3">{c.body}</div>
                        </div>
                        <div className="text-xs text-zinc-500 flex-shrink-0">
                          <span className="inline-flex items-center gap-1">
                            {lang === 'RU' ? 'Лайки' : 'Likes'}: {c.likesCount}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'BOOKMARKS' && (
          <div>
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 px-1">
              {lang === 'RU' ? 'Ваши закладки' : 'Your bookmarks'}
            </h2>
            {bookmarks.length === 0 ? (
              <div className="text-sm text-zinc-500 px-1">
                {lang === 'RU' ? 'Пока нет закладок' : 'No bookmarks yet'}
              </div>
            ) : (
              <div className="space-y-3">
                {bookmarks.map((m) => {
                  const title = (lang === 'RU' ? m.titleRu : m.titleEn) || m.title;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                      onClick={() => onMarketClick(m.id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            <span className="uppercase tracking-wider text-[10px]">{lang === 'RU' ? 'Событие' : 'Event'}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-mono font-semibold text-zinc-100">{Math.round(m.chance)}%</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;


