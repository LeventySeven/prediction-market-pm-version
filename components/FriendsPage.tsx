'use client';

import React, { useMemo, useState } from 'react';
import { Filter, Search, X } from "lucide-react";
import Leaderboard from './Leaderboard';
import Referrals from './Referrals';
import type { LeaderboardUser, User } from '../types';

type FriendsPageProps = {
  lang: 'RU' | 'EN';
  user: User | null;
  leaderboardUsers: LeaderboardUser[];
  leaderboardLoading: boolean;
  leaderboardError: string | null;
  onLogin: () => void;
  onUserClick: (user: LeaderboardUser) => void;
  onCreateReferralLink: () => Promise<{
    referralCode: string;
    referralCommissionRate: number;
    referralEnabled: boolean;
  }>;
  leaderboardSort: 'PNL' | 'BETS';
  onLeaderboardSortChange: (sort: 'PNL' | 'BETS') => void;
};

const FriendsPage: React.FC<FriendsPageProps> = ({ lang, user, leaderboardUsers, leaderboardLoading, leaderboardError, onLogin, onUserClick, onCreateReferralLink, leaderboardSort, onLeaderboardSortChange }) => {
  const [tab, setTab] = useState<'LEADERBOARD' | 'REFERRALS'>('LEADERBOARD');
  const [leaderPickerOpen, setLeaderPickerOpen] = useState(false);
  const [leaderQuery, setLeaderQuery] = useState("");

  const t = useMemo(
    () => ({
      leaderboard: lang === 'RU' ? 'Топ' : 'Top',
      friends: lang === 'RU' ? 'Друзья' : 'Friends',
      pickLeader: lang === "RU" ? "Выбрать лидера" : "Pick a leader",
      search: lang === "RU" ? "Поиск..." : "Search...",
      close: lang === "RU" ? "Закрыть" : "Close",
      noMatches: lang === "RU" ? "Ничего не найдено" : "Nothing found",
    }),
    [lang]
  );

  const filteredLeaders = useMemo(() => {
    const q = leaderQuery.trim().toLowerCase();
    if (!q) return leaderboardUsers;
    return leaderboardUsers.filter((u) => String(u.name ?? "").toLowerCase().includes(q));
  }, [leaderboardUsers, leaderQuery]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32 pb-safe animate-in fade-in duration-300">
      <div className="mb-4 flex items-center gap-2 border border-zinc-900 bg-black rounded-full p-1">
        <button
          type="button"
          onClick={() => setTab('LEADERBOARD')}
          className={`flex-1 rounded-full py-2 text-xs font-bold uppercase tracking-wider transition ${
            tab === 'LEADERBOARD'
              ? 'bg-zinc-950 text-white border border-zinc-800'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          {t.leaderboard}
        </button>
        <button
          type="button"
          onClick={() => setTab('REFERRALS')}
          className={`flex-1 rounded-full py-2 text-xs font-bold uppercase tracking-wider transition ${
            tab === 'REFERRALS'
              ? 'bg-zinc-950 text-white border border-zinc-800'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          {t.friends}
        </button>
      </div>

      {tab === 'LEADERBOARD' ? (
        leaderboardLoading ? (
          <div className="py-10 text-center text-zinc-500 text-sm">
            {lang === 'RU' ? 'Загрузка...' : 'Loading...'}
          </div>
        ) : leaderboardError ? (
          <div className="py-10 text-center text-zinc-500 text-sm">
            {leaderboardError}
          </div>
        ) : leaderboardUsers.length === 0 ? (
          <div className="py-10 text-center text-zinc-500 text-sm">
            {lang === 'RU' ? 'Пока нет данных' : 'No data yet'}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                {lang === "RU" ? "Фильтр" : "Filter"}
              </div>
              <button
                type="button"
                onClick={() => setLeaderPickerOpen(true)}
                className="h-10 w-10 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/70 flex items-center justify-center text-zinc-200 hover:text-white transition-colors"
                aria-label={t.pickLeader}
                title={t.pickLeader}
              >
                <Filter size={16} className="text-zinc-300" />
              </button>
            </div>
            <Leaderboard users={leaderboardUsers} lang={lang} onUserClick={onUserClick} sortBy={leaderboardSort} />
          </>
        )
      ) : (
        <Referrals user={user} onLogin={onLogin} lang={lang} onCreateReferralLink={onCreateReferralLink} />
      )}

      {leaderPickerOpen && tab === "LEADERBOARD" && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" data-swipe-ignore="true">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setLeaderPickerOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-900 bg-black p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-sm font-semibold text-zinc-100">{t.pickLeader}</div>
              <button
                type="button"
                onClick={() => setLeaderPickerOpen(false)}
                className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
                aria-label={t.close}
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              {lang === "RU" ? "Сортировка" : "Sort"}
            </div>
            <div role="radiogroup" className="space-y-2 mb-4">
              {([
                { id: "PNL" as const, labelRu: "PnL", labelEn: "PnL" },
                { id: "BETS" as const, labelRu: "Ставки", labelEn: "Bets" },
              ]).map((opt) => {
                const selected = leaderboardSort === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onLeaderboardSortChange(opt.id)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                      selected
                        ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,0.10)] text-white"
                        : "border-zinc-900 bg-zinc-950/30 text-zinc-300 hover:bg-zinc-950/50"
                    }`}
                  >
                    <div className="text-sm font-semibold">{lang === "RU" ? opt.labelRu : opt.labelEn}</div>
                  </button>
                );
              })}
            </div>

            <div className="relative mb-4">
              <input
                value={leaderQuery}
                onChange={(e) => setLeaderQuery(e.target.value)}
                placeholder={t.search}
                className="w-full h-10 rounded-full bg-zinc-950 border border-zinc-900 px-4 pl-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                autoFocus
              />
              <Search size={16} className="absolute left-3.5 top-3 text-zinc-600" />
            </div>

            <div className="max-h-[60vh] overflow-y-auto space-y-2 custom-scrollbar">
              {filteredLeaders.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">{t.noMatches}</div>
              ) : (
                filteredLeaders.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-3 hover:bg-zinc-950/40 transition-colors flex items-center gap-3"
                    onClick={() => {
                      onUserClick(u);
                      setLeaderPickerOpen(false);
                      setLeaderQuery("");
                    }}
                  >
                    <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full bg-black object-cover border border-zinc-900" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-100 truncate">{u.name}</div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
                        #{u.rank} • {(u.betCount ?? 0).toLocaleString()} {lang === "RU" ? "ставок" : "bets"}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FriendsPage;


