'use client';

import React, { useMemo, useState } from 'react';
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
};

const FriendsPage: React.FC<FriendsPageProps> = ({ lang, user, leaderboardUsers, leaderboardLoading, leaderboardError, onLogin, onUserClick, onCreateReferralLink }) => {
  const [tab, setTab] = useState<'LEADERBOARD' | 'REFERRALS'>('LEADERBOARD');

  const t = useMemo(
    () => ({
      leaderboard: lang === 'RU' ? 'Топ' : 'Top',
      friends: lang === 'RU' ? 'Друзья' : 'Friends',
    }),
    [lang]
  );

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
          <Leaderboard users={leaderboardUsers} lang={lang} onUserClick={onUserClick} />
        )
      ) : (
        <Referrals user={user} onLogin={onLogin} lang={lang} onCreateReferralLink={onCreateReferralLink} />
      )}
    </div>
  );
};

export default FriendsPage;


