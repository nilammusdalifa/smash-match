import React, { useState } from 'react';
import { TournamentSession, Player } from '../types/badminton';
import { Users, HeartHandshake, Swords, Trophy, Sparkles } from 'lucide-react';

interface PlayerMatrixProps {
  session: TournamentSession;
}

export const PlayerMatrix: React.FC<PlayerMatrixProps> = ({ session }) => {
  const [selectedP1, setSelectedP1] = useState<string>(session.players[0]?.id || '');
  const [selectedP2, setSelectedP2] = useState<string>(session.players[1]?.id || '');

  const completedMatches = session.matches.filter((m) => m.status === 'completed');

  // Pairwise Synergy Map: PairKey -> { won: number, played: number, p1: Player, p2: Player }
  const getPairKey = (id1: string, id2: string) => [id1, id2].sort().join('___');
  const synergyMap = new Map<string, { won: number; played: number; p1: Player; p2: Player }>();

  // Head-to-Head Map: [id1, id2] -> { p1Won: number, p2Won: number, played: number }
  const h2hMap = new Map<string, { p1Won: number; p2Won: number; totalPlayed: number }>();

  completedMatches.forEach((m) => {
    const t1 = [m.team1.player1, m.team1.player2];
    const t2 = [m.team2.player1, m.team2.player2];
    const t1Won = m.score.team1Score > m.score.team2Score;

    // Record Team 1 pair
    const k1 = getPairKey(t1[0].id, t1[1].id);
    const curr1 = synergyMap.get(k1) || { won: 0, played: 0, p1: t1[0], p2: t1[1] };
    curr1.played += 1;
    if (t1Won) curr1.won += 1;
    synergyMap.set(k1, curr1);

    // Record Team 2 pair
    const k2 = getPairKey(t2[0].id, t2[1].id);
    const curr2 = synergyMap.get(k2) || { won: 0, played: 0, p1: t2[0], p2: t2[1] };
    curr2.played += 1;
    if (!t1Won) curr2.won += 1;
    synergyMap.set(k2, curr2);

    // Record cross encounters for H2H
    t1.forEach((pA) => {
      t2.forEach((pB) => {
        const hk = [pA.id, pB.id].sort().join('___');
        const hRec = h2hMap.get(hk) || { p1Won: 0, p2Won: 0, totalPlayed: 0 };
        hRec.totalPlayed += 1;
        if (t1Won) {
          if (pA.id < pB.id) hRec.p1Won += 1;
          else hRec.p2Won += 1;
        } else {
          if (pA.id < pB.id) hRec.p2Won += 1;
          else hRec.p1Won += 1;
        }
        h2hMap.set(hk, hRec);
      });
    });
  });

  const synergyList = Array.from(synergyMap.values())
    .map((s) => ({
      ...s,
      winRate: s.played > 0 ? Math.round((s.won / s.played) * 100) : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.played - a.played);

  // Best pair
  const dreamDuo = synergyList.length > 0 ? synergyList[0] : null;

  // Selected H2H comparison
  const playerMap = new Map<string, Player>(session.players.map((p) => [p.id, p]));
  const p1Obj = playerMap.get(selectedP1);
  const p2Obj = playerMap.get(selectedP2);

  let h2hStats = { p1Wins: 0, p2Wins: 0, played: 0, asPartnersPlayed: 0, asPartnersWon: 0 };
  if (p1Obj && p2Obj && selectedP1 !== selectedP2) {
    const pairK = getPairKey(selectedP1, selectedP2);
    const syn = synergyMap.get(pairK);
    if (syn) {
      h2hStats.asPartnersPlayed = syn.played;
      h2hStats.asPartnersWon = syn.won;
    }

    const hk = [selectedP1, selectedP2].sort().join('___');
    const hRecord = h2hMap.get(hk);
    if (hRecord) {
      h2hStats.played = hRecord.totalPlayed;
      if (selectedP1 < selectedP2) {
        h2hStats.p1Wins = hRecord.p1Won;
        h2hStats.p2Wins = hRecord.p2Won;
      } else {
        h2hStats.p1Wins = hRecord.p2Won;
        h2hStats.p2Wins = hRecord.p1Won;
      }
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-slate-900/80 p-4 sm:p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Doubles Partner Synergy & Matchup Matrix</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Discover which doubles pairings have the highest win rates and explore head-to-head match history.
          </p>
        </div>

        {dreamDuo && dreamDuo.played > 0 && (
          <div className="bg-emerald-950/40 border border-emerald-500/40 px-4 py-2.5 rounded-xl flex items-center gap-3">
            <Trophy className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-xs">
              <span className="text-emerald-400 font-bold uppercase tracking-wider block text-[11px]">
                Top Synergy Duo
              </span>
              <span className="font-bold text-white">
                {dreamDuo.p1.name} + {dreamDuo.p2.name}
              </span>
              <span className="text-emerald-400 font-mono ml-2 font-bold">
                {dreamDuo.winRate}% Win ({dreamDuo.won}/{dreamDuo.played})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Head to Head Duel Inspector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Swords className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Head-to-Head & Partnership Duel Inspector</span>
          </h3>
          <span className="text-xs text-slate-400">Select any 2 players</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-11 gap-4 items-center">
          {/* Player 1 Selector */}
          <div className="sm:col-span-4 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">
              Player A
            </label>
            <select
              value={selectedP1}
              onChange={(e) => setSelectedP1(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-bold"
            >
              {session.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* VS Center */}
          <div className="sm:col-span-3 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 mx-auto flex items-center justify-center text-xs font-black text-amber-400">
              VS
            </div>
            <div className="text-xs font-mono text-slate-400">
              {h2hStats.played} Matches Played Against
            </div>
          </div>

          {/* Player 2 Selector */}
          <div className="sm:col-span-4 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-teal-400 uppercase tracking-wider block">
              Player B
            </label>
            <select
              value={selectedP2}
              onChange={(e) => setSelectedP2(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-bold"
            >
              {session.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Duel Result Cards */}
        {selectedP1 !== selectedP2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* When Playing Against Each Other */}
            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Swords className="w-3.5 h-3.5 text-amber-400" />
                <span>As Opponents</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 font-mono">
                <span className="text-emerald-400 font-bold">{p1Obj?.name.split(' ')[0]}: {h2hStats.p1Wins} Wins</span>
                <span className="text-slate-600">vs</span>
                <span className="text-teal-400 font-bold">{p2Obj?.name.split(' ')[0]}: {h2hStats.p2Wins} Wins</span>
              </div>
            </div>

            {/* When Playing as Partners */}
            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <HeartHandshake className="w-3.5 h-3.5 text-emerald-400" />
                <span>As Doubles Partners</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-slate-300 font-mono">
                  {h2hStats.asPartnersWon} Wins out of {h2hStats.asPartnersPlayed} Games Together
                </span>
                <span className="text-emerald-400 font-bold font-mono">
                  {h2hStats.asPartnersPlayed > 0 ? Math.round((h2hStats.asPartnersWon / h2hStats.asPartnersPlayed) * 100) : 0}% Win Rate
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* All Pairs Synergy Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Pairwise Partnership Performance Table</span>
          </h3>
          <span className="text-xs text-slate-400">{synergyList.length} Unique Pair Combinations</span>
        </div>

        {synergyList.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs px-4">
            No completed matches recorded yet. Complete matches to unlock partnership synergy data!
          </div>
        ) : (
          <>
            {/* Mobile: Pair Cards */}
            <div className="sm:hidden divide-y divide-slate-800/60">
              {synergyList.map((s, idx) => (
                <div key={idx} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-white text-sm truncate">
                      <span className="text-emerald-400">{s.p1.name}</span>
                      <span className="text-slate-500 mx-1">&</span>
                      <span className="text-teal-400">{s.p2.name}</span>
                    </div>
                    <span className="font-bold text-white font-mono text-sm shrink-0">{s.winRate}%</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full"
                        style={{ width: `${s.winRate}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {s.played} played • <span className="text-emerald-400">{s.won}W</span>-<span className="text-rose-400">{s.played - s.won}L</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/40 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Doubles Pair</th>
                    <th className="py-3 px-3 text-center">Played</th>
                    <th className="py-3 px-3 text-center">Won</th>
                    <th className="py-3 px-3 text-center">Lost</th>
                    <th className="py-3 px-4 text-center">Partnership Win Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {synergyList.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-semibold text-white">
                        <div className="flex items-center space-x-2">
                          <span className="text-emerald-400">{s.p1.name}</span>
                          <span className="text-slate-500">&</span>
                          <span className="text-teal-400">{s.p2.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-200">{s.played}</td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-400">{s.won}</td>
                      <td className="py-3 px-3 text-center font-bold text-rose-400">{s.played - s.won}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <span className="font-bold text-white font-mono w-10 text-right">{s.winRate}%</span>
                          <div className="w-20 bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full"
                              style={{ width: `${s.winRate}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
