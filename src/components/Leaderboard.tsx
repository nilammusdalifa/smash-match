import React, { useState } from 'react';
import { TournamentSession, PlayerStats, Player } from '../types/badminton';
import { computePlayerStats } from '../utils/ranking';
import { ShareRankingsModal } from './ShareRankingsModal';
import {
  Trophy,
  Flame,
  ArrowUpDown,
  Award,
  HeartHandshake,
  ChevronRight,
  Share2
} from 'lucide-react';

interface LeaderboardProps {
  session: TournamentSession;
  onSelectPlayer: (player: Player) => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ session, onSelectPlayer }) => {
  const [sortBy, setSortBy] = useState<'rank' | 'winRate' | 'pointDiff' | 'wins'>('rank');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [showShare, setShowShare] = useState<boolean>(false);

  const stats = computePlayerStats(session.players, session.matches);
  const top5ByRank = [...stats].sort((a, b) => a.rank - b.rank).slice(0, 5);

  // Sorting (rank already factors in rating as an internal tiebreaker — see ranking.ts)
  const sortedStats = [...stats].sort((a, b) => {
    let diff = 0;
    if (sortBy === 'rank') diff = a.rank - b.rank;
    else if (sortBy === 'wins') diff = b.matchesWon - a.matchesWon;
    else if (sortBy === 'winRate') diff = b.winRate - a.winRate;
    else if (sortBy === 'pointDiff') diff = b.pointDiff - a.pointDiff;

    return sortAsc ? -diff : diff;
  });

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <span className="text-xl">🥇</span>;
    if (rank === 2) return <span className="text-xl">🥈</span>;
    if (rank === 3) return <span className="text-xl">🥉</span>;
    return <span className="font-mono font-bold text-slate-400 text-sm">{rank}</span>;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Highlights */}
      <div className="bg-slate-900/80 p-4 sm:p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Player Rankings</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Updates live as matches finish.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Top Performer Ribbon */}
          {sortedStats.length > 0 && sortedStats[0].matchesPlayed > 0 && (
            <div className="bg-gradient-to-r from-amber-500/10 to-emerald-500/10 border border-amber-500/30 px-4 py-2.5 rounded-xl flex items-center gap-3">
              <Award className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="text-xs">
                <span className="text-amber-400 font-bold uppercase tracking-wider block text-[11px]">
                  Tournament Leader
                </span>
                <span className="font-bold text-white">{sortedStats[0].player.name}</span>
                <span className="text-slate-400 ml-1.5 font-mono">
                  ({sortedStats[0].matchesWon}W - {sortedStats[0].matchesLost}L • {sortedStats[0].winRate}%)
                </span>
              </div>
            </div>
          )}

          {top5ByRank.length > 0 && (
            <button
              onClick={() => setShowShare(true)}
              title="Share Top 5 as an image"
              className="p-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-all shrink-0 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {showShare && (
        <ShareRankingsModal
          sessionName={session.name}
          topStats={top5ByRank}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Mobile: Player Rank Cards */}
      <div className="space-y-2.5 sm:hidden">
        {sortedStats.map((st) => {
          const isHot = st.form.length >= 2 && st.form.slice(-2).every((f) => f === 'W');
          return (
            <button
              key={st.player.id}
              onClick={() => onSelectPlayer(st.player)}
              className="w-full text-left bg-slate-900 border border-slate-800 rounded-2xl p-4 active:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 shrink-0 text-center">{getRankBadge(st.rank)}</div>
                <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                  {st.player.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white flex items-center gap-1.5 truncate">
                    <span className="truncate">{st.player.name}</span>
                    {isHot && <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse fill-amber-400/30" />}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {st.matchesPlayed} played • <span className="text-emerald-400 font-semibold">{st.matchesWon}W</span>-<span className="text-rose-400 font-semibold">{st.matchesLost}L</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-950/60 rounded-lg py-1.5">
                  <div className="text-xs font-bold text-slate-200">{st.winRate}%</div>
                  <div className="text-[10px] text-slate-500">Win Rate</div>
                </div>
                <div className="bg-slate-950/60 rounded-lg py-1.5">
                  <div className={`text-xs font-bold ${st.pointDiff > 0 ? 'text-emerald-400' : st.pointDiff < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                    {st.pointDiff > 0 ? `+${st.pointDiff}` : st.pointDiff}
                  </div>
                  <div className="text-[10px] text-slate-500">Pt Diff</div>
                </div>
                <div className="bg-slate-950/60 rounded-lg py-1.5 flex items-center justify-center gap-1">
                  {st.form.length === 0 ? (
                    <span className="text-slate-600 text-[10px]">No games</span>
                  ) : (
                    st.form.map((f, i) => (
                      <span
                        key={i}
                        className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center ${
                          f === 'W'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {f}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop: Main Leaderboard Table */}
      <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 text-center cursor-pointer" onClick={() => handleSort('rank')}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Rank</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4 font-semibold">Player</th>
                <th className="py-3.5 px-3 text-center cursor-pointer" onClick={() => handleSort('wins')}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Played (W / L)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-3 text-center cursor-pointer" onClick={() => handleSort('winRate')}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Win Rate</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-3 text-center cursor-pointer" onClick={() => handleSort('pointDiff')}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Pt Diff (+/-)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-3 text-center">PF : PA</th>
                <th className="py-3.5 px-4 text-center">Recent Form</th>
                <th className="py-3.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedStats.map((st) => {
                const isHot = st.form.length >= 2 && st.form.slice(-2).every((f) => f === 'W');

                return (
                  <tr
                    key={st.player.id}
                    onClick={() => onSelectPlayer(st.player)}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                  >
                    {/* Rank */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {getRankBadge(st.rank)}
                    </td>

                    {/* Player Name & Skill */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 group-hover:border-emerald-500/50 transition-all">
                          {st.player.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                            <span>{st.player.name}</span>
                            {isHot && (
                              <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse fill-amber-400/30" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {st.player.skillLevel && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                                {st.player.skillLevel}
                              </span>
                            )}
                            {st.favoritePartner && (
                              <span className="text-[10px] text-emerald-400/80 flex items-center gap-0.5">
                                <HeartHandshake className="w-2.5 h-2.5" /> Best w/ {st.favoritePartner.partner.name.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Matches Won / Lost */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <span className="font-bold text-white">{st.matchesPlayed}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="font-bold text-emerald-400">{st.matchesWon}W</span>
                      <span className="text-slate-500 mx-1">-</span>
                      <span className="font-bold text-rose-400">{st.matchesLost}L</span>
                    </td>

                    {/* Win Rate */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center space-y-1">
                        <span className="font-bold text-slate-200">{st.winRate}%</span>
                        <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{ width: `${st.winRate}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Point Diff */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={`font-mono font-bold px-2 py-0.5 rounded-md ${
                          st.pointDiff > 0
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : st.pointDiff < 0
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {st.pointDiff > 0 ? `+${st.pointDiff}` : st.pointDiff}
                      </span>
                    </td>

                    {/* PF : PA */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap font-mono text-slate-400">
                      <span className="text-slate-200">{st.pointsScored}</span>
                      <span className="text-slate-600 mx-1">:</span>
                      <span className="text-slate-400">{st.pointsConceded}</span>
                    </td>

                    {/* Recent Form */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-1">
                        {st.form.length === 0 ? (
                          <span className="text-slate-600 text-[10px]">-</span>
                        ) : (
                          st.form.map((f, i) => (
                            <span
                              key={i}
                              className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center ${
                                f === 'W'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              }`}
                            >
                              {f}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Arrow action */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all inline-block" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
