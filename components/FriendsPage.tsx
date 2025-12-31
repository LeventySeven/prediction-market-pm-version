'use client';

import React, { useMemo, useState } from 'react';
import Leaderboard from './Leaderboard';
import Referrals from './Referrals';
import type { LeaderboardUser, User } from '../types';

type FriendsPageProps = {
  lang: 'RU' | 'EN';
  user: User | null;
  leaderboardUsers: LeaderboardUser[];
  onLogin: () => void;
  onCreateReferralLink: () => Promise<{
    referralCode: string;
    referralCommissionRate: number;
    referralEnabled: boolean;
  }>;
};

const FriendsPage: React.FC<FriendsPageProps> = ({ lang, user, leaderboardUsers, onLogin, onCreateReferralLink }) => {
  const [tab, setTab] = useState<'LEADERBOARD' | 'REFERRALS'>('REFERRALS');

  const t = useMemo(
    () => ({
      leaderboard: lang === 'RU' ? 'Топ' : 'Top',
      friends: lang === 'RU' ? 'Друзья' : 'Friends',
    }),
    [lang]
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 animate-in fade-in duration-300">
      <div className="mb-4 flex items-center gap-2 border border-zinc-900 bg-black rounded-full p-1">
        <button
          type="button"
          onClick={() => setTab('REFERRALS')}
          className={`flex-1 rounded-full py-2 text-xs font-bold uppercase tracking-wider transition ${
            tab === 'REFERRALS'
              ? 'bg-white text-black'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          {t.friends}
        </button>
        <button
          type="button"
          onClick={() => setTab('LEADERBOARD')}
          className={`flex-1 rounded-full py-2 text-xs font-bold uppercase tracking-wider transition ${
            tab === 'LEADERBOARD'
              ? 'bg-white text-black'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          {t.leaderboard}
        </button>
      </div>

      {tab === 'REFERRALS' ? (
        <Referrals user={user} onLogin={onLogin} lang={lang} onCreateReferralLink={onCreateReferralLink} />
      ) : (
        <Leaderboard users={leaderboardUsers} lang={lang} onUserClick={() => {}} />
      )}
    </div>
  );
};

export default FriendsPage;


