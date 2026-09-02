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
  /** Player (view-only) mode: hides tier, which is organizer-facing info. */
  readOnly?: boolean;
}

// A short horizontal rule with corner ticks, echoing a badminton court's
// short service line — used as the one visual divider on this page,
// marking exactly where "has played" ends and "hasn't played yet" begins.
const ServiceLineDivider: React.FC<{ label: string; patchBg: string }> = ({ label, patchBg }) => (
  <div className="relative py-2">
    <div className="h-px bg-slate-200/50 light:bg-slate-300/50" />
    <span
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 light:text-slate-400 ${patchBg}`}
    >
      {label}
    </span>
  </div>
);

export const Leaderboard: React.FC<LeaderboardProps> = ({ session, onSelectPlayer, readOnly = false }) => {
  const [sortBy, setSortBy] = useState<'rank' | 'winRate' | 'pointDiff' | 'wins'>('rank');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [showShare, setShowShare] = useState<boolean>(false);

  const stats = computePlayerStats(session.players, session.matches);
  const top5ByRank = [...stats].sort((a, b) => a.rank - b.rank).slice(0, 5);

  // Sorting (rank already factors in rating as an internal tiebreaker — see
  // ranking.ts). Ties preserve the incoming played-before-unplayed order
  // from computePlayerStats since Array.sort is stable, so the service-line
  // divider position below stays correct under every sort column.
  const sortedStats = [...stats].sort((a, b) => {
    let diff = 0;
    if (sortBy === 'rank') diff = a.rank - b.rank;
    else if (sortBy === 'wins') diff = b.matchesWon - a.matchesWon;
    else if (sortBy === 'winRate') diff = b.winRate - a.winRate;
    else if (sortBy === 'pointDiff') diff = b.pointDiff - a.pointDiff;

    return sortAsc ? -diff : diff;
  });

  const firstUnplayedIndex = sortedStats.findIndex((st) => st.matchesPlayed === 0);
  const hasDivider = firstUnplayedIndex > 0;

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  // No medal (or even a rank number) for anyone who hasn't played a match
  // yet — a "ranking" with 0 games behind it is meaningless, and handing
  // out gold/silver/bronze before anyone's played is actively misleading.
  const getRankBadge = (rank: number, matchesPlayed: number) => {
    if (matchesPlayed === 0) return <span className="font-mono tabular-nums text-slate-600 light:text-slate-300 text-sm">—</span>;
    if (rank === 1) return <span className="text-xl">🥇</span>;
    if (rank === 2) return <span className="text-xl">🥈</span>;
    if (rank === 3) return <span className="text-xl">🥉</span>;
    return <span className="font-mono tabular-nums font-bold text-slate-400 light:text-slate-500 text-sm">{rank}</span>;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Highlights */}
      <div className="bg-slate-900/80 light:bg-white/80 p-4 sm:p-5 rounded-2xl border border-slate-800 light:border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white light:text-slate-900 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400 light:text-amber-600 shrink-0" />
            <span>Player Rankings</span>
          </h2>
          <p className="text-xs text-slate-400 light:text-slate-500 mt-1">
            Updates live as matches finish.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* On Serve — the current leader, styled after the same pulsing-dot
              "serving" indicator already used in the live scorekeeper, so it
              reads as a familiar convention rather than a new decoration. */}
          {sortedStats.length > 0 && sortedStats[0].matchesPlayed > 0 && (
            <div className="bg-gradient-to-r from-amber-500/10 light:from-amber-50 to-emerald-500/10 light:to-emerald-50 border border-amber-500/30 light:border-amber-300 px-4 py-2.5 rounded-xl flex items-center gap-3">
              <Award className="w-5 h-5 text-amber-400 light:text-amber-600 shrink-0" />
              <div className="text-xs">
                <span className="text-amber-400 light:text-amber-600 font-bold uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                  On Serve
                </span>
                <span className="font-bold text-white light:text-slate-900">{sortedStats[0].player.name}</span>
                <span className="text-slate-400 light:text-slate-500 ml-1.5 font-mono tabular-nums">
                  ({sortedStats[0].matchesWon}W - {sortedStats[0].matchesLost}L • {sortedStats[0].winRate}%)
                </span>
              </div>
            </div>
          )}

          {top5ByRank.length > 0 && (
            <button
              onClick={() => setShowShare(true)}
              title="Share Top 5 as an image"
              className="p-2.5 rounded-xl bg-slate-800 light:bg-slate-100 text-slate-300 light:text-slate-600 border border-slate-700 light:border-slate-300 hover:bg-slate-700 light:hover:bg-slate-200 hover:text-white light:hover:text-slate-900 transition-all shrink-0 cursor-pointer"
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
        {sortedStats.map((st, idx) => {
          const isHot = st.form.length >= 2 && st.form.slice(-2).every((f) => f === 'W');
          const card = (
            <button
              key={st.player.id}
              onClick={() => onSelectPlayer(st.player)}
              className={`w-full text-left bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl p-4 active:bg-slate-800/60 light:active:bg-slate-100/60 transition-colors ${
                st.matchesPlayed === 0 ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 shrink-0 text-center">{getRankBadge(st.rank, st.matchesPlayed)}</div>
                <div className="w-9 h-9 rounded-full bg-slate-800 light:bg-slate-100 border border-slate-700 light:border-slate-300 flex items-center justify-center text-xs font-bold text-slate-300 light:text-slate-600 shrink-0">
                  {st.player.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-bold flex items-center gap-1.5 truncate ${st.matchesPlayed === 0 ? 'text-slate-400 light:text-slate-500' : 'text-white light:text-slate-900'}`}>
                    <span className="truncate">{st.player.name}</span>
                    {isHot && <Flame className="w-3.5 h-3.5 text-amber-400 light:text-amber-600 shrink-0 animate-pulse fill-amber-400/30" />}
                  </div>
                  <div className="text-[11px] text-slate-400 light:text-slate-500 font-mono tabular-nums">
                    {st.matchesPlayed} played • <span className="text-emerald-400 light:text-emerald-600 font-semibold">{st.matchesWon}W</span>-<span className="text-rose-400 light:text-rose-600 font-semibold">{st.matchesLost}L</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-950/60 light:bg-slate-50/60 rounded-lg py-1.5">
                  <div className="text-xs font-bold font-mono tabular-nums text-slate-200 light:text-slate-700">{st.winRate}%</div>
                  <div className="text-[10px] text-slate-500 light:text-slate-400">Win Rate</div>
                </div>
                <div className="bg-slate-950/60 light:bg-slate-50/60 rounded-lg py-1.5">
                  <div className={`text-xs font-bold font-mono tabular-nums ${st.pointDiff > 0 ? 'text-emerald-400 light:text-emerald-600' : st.pointDiff < 0 ? 'text-rose-400 light:text-rose-600' : 'text-slate-300 light:text-slate-600'}`}>
                    {st.pointDiff > 0 ? `+${st.pointDiff}` : st.pointDiff}
                  </div>
                  <div className="text-[10px] text-slate-500 light:text-slate-400">Pt Diff</div>
                </div>
                <div className="bg-slate-950/60 light:bg-slate-50/60 rounded-lg py-1.5 flex items-center justify-center gap-1">
                  {st.form.length === 0 ? (
                    <span className="text-slate-600 light:text-slate-300 text-[10px]">No games</span>
                  ) : (
                    st.form.map((f, i) => (
                      <span
                        key={i}
                        className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center ${
                          f === 'W'
                            ? 'bg-emerald-500/20 light:bg-emerald-100 text-emerald-400 light:text-emerald-600 border border-emerald-500/40 light:border-emerald-300'
                            : 'bg-rose-500/20 light:bg-rose-100 text-rose-400 light:text-rose-600 border border-rose-500/40 light:border-rose-300'
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

          if (hasDivider && idx === firstUnplayedIndex) {
            return (
              <React.Fragment key={`${st.player.id}-wrap`}>
                <ServiceLineDivider label="Not yet on court" patchBg="bg-slate-950 light:bg-slate-50" />
                {card}
              </React.Fragment>
            );
          }
          return card;
        })}
      </div>

      {/* Desktop: Main Leaderboard Table */}
      <div className="hidden sm:block bg-slate-900 light:bg-white border border-slate-800 light:border-slate-200 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 light:text-slate-600">
            <thead className="bg-slate-950/80 light:bg-slate-50/80 text-slate-400 light:text-slate-500 border-b border-slate-800 light:border-slate-200 text-[11px] uppercase tracking-wider">
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
            <tbody className="divide-y divide-slate-800/60 light:divide-slate-200/60">
              {sortedStats.map((st, idx) => {
                const isHot = st.form.length >= 2 && st.form.slice(-2).every((f) => f === 'W');
                const notPlayed = st.matchesPlayed === 0;

                const row = (
                  <tr
                    key={st.player.id}
                    onClick={() => onSelectPlayer(st.player)}
                    className={`hover:bg-slate-800/50 light:hover:bg-slate-100/50 transition-colors cursor-pointer group ${notPlayed ? 'opacity-60' : ''}`}
                  >
                    {/* Rank */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {getRankBadge(st.rank, st.matchesPlayed)}
                    </td>

                    {/* Player Name & Skill */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-800 light:bg-slate-100 border border-slate-700 light:border-slate-300 flex items-center justify-center text-xs font-bold text-slate-300 light:text-slate-600 group-hover:border-emerald-500/50 light:group-hover:border-emerald-300 transition-all">
                          {st.player.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className={`font-bold group-hover:text-emerald-400 light:group-hover:text-emerald-600 transition-colors flex items-center gap-1.5 ${notPlayed ? 'text-slate-400 light:text-slate-500' : 'text-white light:text-slate-900'}`}>
                            <span>{st.player.name}</span>
                            {isHot && (
                              <Flame className="w-3.5 h-3.5 text-amber-400 light:text-amber-600 animate-pulse fill-amber-400/30" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {!readOnly && st.player.skillLevel && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-500 border border-slate-700/60 light:border-slate-300/60">
                                {st.player.skillLevel}
                              </span>
                            )}
                            {st.favoritePartner && (
                              <span className="text-[10px] text-emerald-400/80 light:text-emerald-600/80 flex items-center gap-0.5">
                                <HeartHandshake className="w-2.5 h-2.5" /> Best w/ {st.favoritePartner.partner.name.split(' ')[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Matches Won / Lost */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap font-mono tabular-nums">
                      <span className="font-bold text-white light:text-slate-900">{st.matchesPlayed}</span>
                      <span className="text-slate-500 light:text-slate-400 mx-1">/</span>
                      <span className="font-bold text-emerald-400 light:text-emerald-600">{st.matchesWon}W</span>
                      <span className="text-slate-500 light:text-slate-400 mx-1">-</span>
                      <span className="font-bold text-rose-400 light:text-rose-600">{st.matchesLost}L</span>
                    </td>

                    {/* Win Rate */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center space-y-1">
                        <span className="font-bold font-mono tabular-nums text-slate-200 light:text-slate-700">{st.winRate}%</span>
                        <div className="w-16 bg-slate-800 light:bg-slate-100 h-1.5 rounded-full overflow-hidden">
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
                        className={`font-mono tabular-nums font-bold px-2 py-0.5 rounded-md ${
                          st.pointDiff > 0
                            ? 'bg-emerald-500/10 light:bg-emerald-50 text-emerald-400 light:text-emerald-600 border border-emerald-500/20 light:border-emerald-200'
                            : st.pointDiff < 0
                            ? 'bg-rose-500/10 light:bg-rose-50 text-rose-400 light:text-rose-600 border border-rose-500/20 light:border-rose-200'
                            : 'bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-500'
                        }`}
                      >
                        {st.pointDiff > 0 ? `+${st.pointDiff}` : st.pointDiff}
                      </span>
                    </td>

                    {/* PF : PA */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap font-mono tabular-nums text-slate-400 light:text-slate-500">
                      <span className="text-slate-200 light:text-slate-700">{st.pointsScored}</span>
                      <span className="text-slate-600 light:text-slate-300 mx-1">:</span>
                      <span className="text-slate-400 light:text-slate-500">{st.pointsConceded}</span>
                    </td>

                    {/* Recent Form */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-1">
                        {st.form.length === 0 ? (
                          <span className="text-slate-600 light:text-slate-300 text-[10px]">-</span>
                        ) : (
                          st.form.map((f, i) => (
                            <span
                              key={i}
                              className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center ${
                                f === 'W'
                                  ? 'bg-emerald-500/20 light:bg-emerald-100 text-emerald-400 light:text-emerald-600 border border-emerald-500/40 light:border-emerald-300'
                                  : 'bg-rose-500/20 light:bg-rose-100 text-rose-400 light:text-rose-600 border border-rose-500/40 light:border-rose-300'
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
                      <ChevronRight className="w-4 h-4 text-slate-600 light:text-slate-300 group-hover:text-emerald-400 light:group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all inline-block" />
                    </td>
                  </tr>
                );

                if (hasDivider && idx === firstUnplayedIndex) {
                  return (
                    <React.Fragment key={`${st.player.id}-wrap`}>
                      <tr>
                        <td colSpan={8} className="p-0">
                          <ServiceLineDivider label="Not yet on court" patchBg="bg-slate-900 light:bg-white" />
                        </td>
                      </tr>
                      {row}
                    </React.Fragment>
                  );
                }
                return row;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
