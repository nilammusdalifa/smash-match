import React, { useState } from 'react';
import { TournamentSession, Match, Player } from '../types/badminton';
import {
  CheckCircle2,
  Play,
  Edit3,
  Plus,
  SlidersHorizontal,
  Clock,
  Sparkles,
  Users,
  Search,
  Zap,
  ArrowRight,
  Shuffle,
  Trash2,
} from 'lucide-react';
import {
  generateId,
  pickTopAvailableFoursomeOptions,
  computeCarryHistory,
  computePartnerCounts,
  computeOpponentCounts,
} from '../utils/scheduler';
import { computeFairShare, presentPlayers } from '../utils/fairness';

interface MatchQueueProps {
  session: TournamentSession;
  onUpdateMatchScore: (matchId: string, team1Score: number, team2Score: number, isCompleted?: boolean) => void;
  onStartMatch: (matchId: string, courtId: string) => void;
  onOpenScorekeeper: (match: Match) => void;
  onAddCustomMatch: (match: Match) => void;
  onDeleteMatch: (matchId: string) => void;
  onUpdateMatchPlayers: (matchId: string, team1: [string, string], team2: [string, string]) => void;
  readOnly?: boolean;
}

export const MatchQueue: React.FC<MatchQueueProps> = ({
  session,
  onUpdateMatchScore,
  onStartMatch,
  onOpenScorekeeper,
  onAddCustomMatch,
  onDeleteMatch,
  onUpdateMatchPlayers,
  readOnly = false,
}) => {
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'in_progress' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');

  // Quick edit score modal / inline state
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editT1, setEditT1] = useState<number>(session.rules.pointsToWin);
  const [editT2, setEditT2] = useState<number>(Math.max(0, session.rules.pointsToWin - 3));

  // Custom match creator modal state
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [customP1, setCustomP1] = useState<string>(session.players[0]?.id || '');
  const [customP2, setCustomP2] = useState<string>(session.players[1]?.id || '');
  const [customP3, setCustomP3] = useState<string>(session.players[2]?.id || '');
  const [customP4, setCustomP4] = useState<string>(session.players[3]?.id || '');
  const [customCourt, setCustomCourt] = useState<string>('1');

  // Swap/reshuffle editor for an already-scheduled (not yet played) match
  const [editingSwapMatchId, setEditingSwapMatchId] = useState<string | null>(null);
  const [swapP1, setSwapP1] = useState<string>('');
  const [swapP2, setSwapP2] = useState<string>('');
  const [swapP3, setSwapP3] = useState<string>('');
  const [swapP4, setSwapP4] = useState<string>('');

  // Filter matches
  const filteredMatches = session.matches.filter((m) => {
    if (filter === 'scheduled' && m.status !== 'scheduled') return false;
    if (filter === 'in_progress' && m.status !== 'in_progress') return false;
    if (filter === 'completed' && m.status !== 'completed') return false;
    if (selectedRound !== 'all' && m.roundNumber !== selectedRound) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const pNames = [
        m.team1.player1.name,
        m.team1.player2.name,
        m.team2.player1.name,
        m.team2.player2.name,
      ].join(' ').toLowerCase();
      return pNames.includes(q);
    }
    return true;
  }).sort((a, b) => {
    // Completed matches sink to the bottom (stable sort keeps everything
    // else in its original round/match order — this is a no-op when the
    // filter already shows only one status, e.g. "Completed" alone).
    const aCompleted = a.status === 'completed' ? 1 : 0;
    const bCompleted = b.status === 'completed' ? 1 : 0;
    return aCompleted - bCompleted;
  });

  // Group matches by round for nice structural view
  const rounds = Array.from(new Set<number>(session.matches.map((m) => m.roundNumber))).sort((a: number, b: number) => a - b);

  const handleSaveQuickScore = (matchId: string) => {
    onUpdateMatchScore(matchId, editT1, editT2, true);
    setEditingMatchId(null);
  };

  const handleCreateCustomMatch = () => {
    const playerMap = new Map<string, Player>(session.players.map((p) => [p.id, p]));
    const p1 = playerMap.get(customP1);
    const p2 = playerMap.get(customP2);
    const p3 = playerMap.get(customP3);
    const p4 = playerMap.get(customP4);

    if (!p1 || !p2 || !p3 || !p4) {
      alert('Please select 4 valid players');
      return;
    }

    const uniqueIds = new Set([customP1, customP2, customP3, customP4]);
    if (uniqueIds.size < 4) {
      alert('All 4 players must be distinct individuals!');
      return;
    }

    const newMatch: Match = {
      id: generateId(),
      roundNumber: Math.max(...session.matches.map((m) => m.roundNumber), 0) + 1,
      matchNumber: session.matches.length + 1,
      courtId: customCourt,
      courtName: session.courts.find((c) => c.id === customCourt)?.name || `Court ${customCourt}`,
      team1: { player1: p1, player2: p2 },
      team2: { player1: p3, player2: p4 },
      score: {
        team1Score: 0,
        team2Score: 0,
        isCompleted: false,
        history: [],
      },
      status: 'scheduled',
    };

    onAddCustomMatch(newMatch);
    setShowCustomModal(false);
  };

  // Smart Balanced Matchmaking suggestion — picks 4 players and splits them
  // into fair teams (tier first, then carry/partner/opponent balance),
  // the same rule the auto-generated schedule uses. Doesn't exclude
  // players currently on court, or already queued in some other scheduled
  // match: Custom Match is commonly used to queue up a match for after the
  // current rotation, so today's "busy" players will be free by the time
  // this one starts. It DOES exclude away players — no amount of "will be
  // free soon" reasoning applies to someone who isn't here.
  //
  // Picks randomly among several comparably-fair options (not always the
  // literal single best) so clicking again after a suggestion you don't
  // want actually gives you something different, instead of the same
  // deterministic answer every time.
  const handleAutoBalanceCustom = () => {
    const available = presentPlayers(session.players, Date.now(), session.createdAt);
    if (available.length < 4) {
      alert('Not enough present players to auto-fill 4.');
      return;
    }

    // Real match history (completed + in-progress) drives fairness: whoever
    // has the highest fair-share deficit must play, and who fills the rest
    // (when several people are close on deficit) is chosen for tier
    // balance and carry fairness — same rules the auto-generated schedule
    // uses.
    const historyMatches = session.matches.filter((m) => m.status !== 'scheduled');
    const fairShare = computeFairShare(historyMatches, session.players, session.createdAt);
    const carryHistory = computeCarryHistory(historyMatches);
    const partnerCounts = computePartnerCounts(historyMatches);
    const opponentCounts = computeOpponentCounts(historyMatches);

    const options = pickTopAvailableFoursomeOptions(available, {
      fairShare,
      partnerCounts,
      opponentCounts,
      carryHistory,
    });
    const { split: best } = options[Math.floor(Math.random() * options.length)];

    setCustomP1(best.t1[0].id);
    setCustomP2(best.t1[1].id);
    setCustomP3(best.t2[0].id);
    setCustomP4(best.t2[1].id);
  };

  const handleOpenSwapEditor = (m: Match) => {
    setEditingSwapMatchId(m.id);
    setSwapP1(m.team1.player1.id);
    setSwapP2(m.team1.player2.id);
    setSwapP3(m.team2.player1.id);
    setSwapP4(m.team2.player2.id);
  };

  const handleReshuffleMatch = (m: Match) => {
    // Not excluding players busy on another live court or in another
    // scheduled match — same reasoning as Auto Fill above. Does exclude
    // away players.
    const available = presentPlayers(session.players, Date.now(), session.createdAt);
    if (available.length < 4) {
      alert('Not enough present players to reshuffle.');
      return;
    }

    const historyMatches = session.matches.filter((o) => o.id !== m.id && o.status !== 'scheduled');
    const fairShare = computeFairShare(historyMatches, session.players, session.createdAt);
    const carryHistory = computeCarryHistory(historyMatches);
    const partnerCounts = computePartnerCounts(historyMatches);
    const opponentCounts = computeOpponentCounts(historyMatches);

    const options = pickTopAvailableFoursomeOptions(available, {
      fairShare,
      partnerCounts,
      opponentCounts,
      carryHistory,
    });
    const { split: best } = options[Math.floor(Math.random() * options.length)];
    setSwapP1(best.t1[0].id);
    setSwapP2(best.t1[1].id);
    setSwapP3(best.t2[0].id);
    setSwapP4(best.t2[1].id);
  };

  const handleSaveSwap = () => {
    if (!editingSwapMatchId) return;
    const ids = new Set([swapP1, swapP2, swapP3, swapP4]);
    if (ids.size < 4) {
      alert('All 4 players must be distinct individuals!');
      return;
    }
    onUpdateMatchPlayers(editingSwapMatchId, [swapP1, swapP2], [swapP3, swapP4]);
    setEditingSwapMatchId(null);
  };

  const handleDeleteMatchClick = (m: Match) => {
    const warning =
      m.status === 'completed'
        ? 'Delete this completed match? Its score will be erased and everyone\'s rating will be recalculated as if it never happened.'
        : m.status === 'in_progress'
        ? 'Delete this in-progress match? The court will be freed up and the 4 players will just sit out this round.'
        : 'Remove this match? The 4 players will just sit out this round.';
    if (confirm(warning)) {
      onDeleteMatch(m.id);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Controls Bar */}
      <div className="bg-slate-900/80 p-4 sm:p-5 rounded-2xl border border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex flex-wrap items-center gap-2">
            <span>Schedule</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
              {session.matches.length} Total Matches
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Everyone rotates fairly across all rounds.
          </p>
        </div>

        {/* Action Buttons */}
        {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-open-custom-match"
            onClick={() => setShowCustomModal(true)}
            className="w-full sm:w-auto justify-center px-3.5 py-2.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Custom Match</span>
          </button>
        </div>
        )}
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
        {/* Status Filters */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
              filter === 'all' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({session.matches.length})
          </button>
          <button
            onClick={() => setFilter('in_progress')}
            className={`px-3 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
              filter === 'in_progress' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Live ({session.matches.filter((m) => m.status === 'in_progress').length})
          </button>
          <button
            onClick={() => setFilter('scheduled')}
            className={`px-3 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
              filter === 'scheduled' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Upcoming ({session.matches.filter((m) => m.status === 'scheduled').length})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-3 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
              filter === 'completed' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Completed ({session.matches.filter((m) => m.status === 'completed').length})
          </button>
        </div>

        {/* Round Filter & Search */}
        <div className="flex items-center gap-2">
          <select
            value={selectedRound}
            onChange={(e) => setSelectedRound(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-slate-900 text-slate-300 text-xs rounded-xl px-3 py-2.5 sm:py-1.5 border border-slate-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Rounds</option>
            {rounds.map((r) => (
              <option key={r} value={r}>
                Round {r}
              </option>
            ))}
          </select>

          <div className="relative flex-1 sm:flex-none">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search player..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900 text-slate-200 placeholder-slate-500 text-xs rounded-xl pl-8 pr-3 py-2.5 sm:py-1.5 border border-slate-700 focus:outline-none focus:border-emerald-500 w-full sm:w-44"
            />
          </div>
        </div>
      </div>

      {/* Match Cards List */}
      <div className="space-y-3">
        {filteredMatches.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400">
            <p className="text-sm">No matches match your filters.</p>
          </div>
        ) : (
          filteredMatches.map((m) => {
            const isEditing = editingMatchId === m.id;
            const isSwapEditing = editingSwapMatchId === m.id;
            const isCompleted = m.status === 'completed';
            const isLive = m.status === 'in_progress';
            const isScheduled = m.status === 'scheduled';
            const team1Won = isCompleted && m.score.team1Score > m.score.team2Score;
            const team2Won = isCompleted && m.score.team2Score > m.score.team1Score;

            // Players eligible to fill a slot in this match's swap editor:
            // present players. Not excluding players busy in another
            // scheduled or in-progress match — this match may be queued for
            // after they finish, same reasoning as Auto Fill.
            const swapOptions = isSwapEditing
              ? presentPlayers(session.players, Date.now(), session.createdAt)
              : [];

            return (
              <div
                key={m.id}
                id={`match-row-${m.id}`}
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  isLive
                    ? 'bg-slate-900/90 border-emerald-500/50 shadow-md shadow-emerald-950/20'
                    : isCompleted
                    ? 'bg-slate-900/50 border-slate-800/80 opacity-90'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  {/* Match Info & Round — fixed width so the Resting list's
                      length doesn't steal variable space from the team
                      boxes below, which would make them a different width
                      on every row. */}
                  <div className="flex items-center space-x-3 shrink-0 sm:w-56">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center text-center shrink-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">R{m.roundNumber}</span>
                      <span className="text-xs font-black text-white">#{m.matchNumber}</span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-300">
                          {m.courtName || 'Court 1'}
                        </span>
                        {isLive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Live
                          </span>
                        )}
                        {isCompleted && (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                            Completed
                          </span>
                        )}
                      </div>

                      {m.restingPlayerIds && m.restingPlayerIds.length > 0 && (
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          Resting: {session.players.filter((p) => m.restingPlayerIds?.includes(p.id)).map((p) => p.name).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Teams and Scores */}
                  {!isSwapEditing && (
                  <div className="flex-1 flex flex-col sm:grid sm:grid-cols-11 gap-2 items-center text-center">
                    {/* Team 1 */}
                    <div className={`w-full sm:col-span-4 p-2 rounded-xl border ${team1Won ? 'bg-emerald-950/30 border-emerald-500/40 font-bold' : 'bg-slate-950/40 border-slate-800/60'}`}>
                      <div className="text-sm text-slate-200 truncate" title={m.team1.player1.name}>
                        {m.team1.player1.name}
                      </div>
                      <div className="text-sm text-slate-300 truncate font-semibold" title={m.team1.player2.name}>
                        {m.team1.player2.name}
                      </div>
                    </div>

                    {/* Score / VS */}
                    <div className="sm:col-span-3">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max="30"
                            value={editT1}
                            onChange={(e) => setEditT1(Number(e.target.value))}
                            className="w-12 h-9 text-center bg-slate-950 border border-emerald-500 rounded p-1 text-sm font-mono text-white"
                          />
                          <span className="text-slate-500">:</span>
                          <input
                            type="number"
                            min="0"
                            max="30"
                            value={editT2}
                            onChange={(e) => setEditT2(Number(e.target.value))}
                            className="w-12 h-9 text-center bg-slate-950 border border-emerald-500 rounded p-1 text-sm font-mono text-white"
                          />
                        </div>
                      ) : isCompleted || isLive ? (
                        <div className="font-mono font-bold text-lg sm:text-xl text-white">
                          <span className={team1Won ? 'text-emerald-400' : ''}>{m.score.team1Score}</span>
                          <span className="text-slate-600 mx-1">-</span>
                          <span className={team2Won ? 'text-emerald-400' : ''}>{m.score.team2Score}</span>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">VS</span>
                      )}
                    </div>

                    {/* Team 2 */}
                    <div className={`w-full sm:col-span-4 p-2 rounded-xl border ${team2Won ? 'bg-emerald-950/30 border-emerald-500/40 font-bold' : 'bg-slate-950/40 border-slate-800/60'}`}>
                      <div className="text-sm text-slate-200 truncate" title={m.team2.player1.name}>
                        {m.team2.player1.name}
                      </div>
                      <div className="text-sm text-slate-300 truncate font-semibold" title={m.team2.player2.name}>
                        {m.team2.player2.name}
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Swap Editor — replaces the team display while editing a scheduled match's players */}
                  {isSwapEditing && (
                    <div className="flex-1 grid grid-cols-2 gap-3 w-full">
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Team A</span>
                        <select
                          value={swapP1}
                          onChange={(e) => setSwapP1(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-200"
                        >
                          {swapOptions.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          value={swapP2}
                          onChange={(e) => setSwapP2(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-200"
                        >
                          {swapOptions.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">Team B</span>
                        <select
                          value={swapP3}
                          onChange={(e) => setSwapP3(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-200"
                        >
                          {swapOptions.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          value={swapP4}
                          onChange={(e) => setSwapP4(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-200"
                        >
                          {swapOptions.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {!readOnly && (
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 w-full sm:w-auto">
                    {isSwapEditing ? (
                      <>
                        <button
                          onClick={() => handleReshuffleMatch(m)}
                          title="Auto-suggest a fresh balanced matchup"
                          className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs border border-emerald-500/30 cursor-pointer"
                        >
                          <Shuffle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleSaveSwap}
                          className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingSwapMatchId(null)}
                          className="flex-1 sm:flex-none px-2.5 py-2 rounded-lg bg-slate-800 text-slate-400 text-xs hover:text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    ) : isEditing ? (
                      <>
                        <button
                          onClick={() => handleSaveQuickScore(m.id)}
                          className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingMatchId(null)}
                          className="flex-1 sm:flex-none px-2.5 py-2 rounded-lg bg-slate-800 text-slate-400 text-xs hover:text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Swap — only meaningful before a match has started */}
                        {isScheduled && (
                          <>
                            <button
                              onClick={() => handleOpenSwapEditor(m)}
                              title="Swap players in this match"
                              className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700 cursor-pointer"
                            >
                              <Shuffle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteMatchClick(m)}
                              title="Delete this match"
                              className="p-2.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs border border-slate-700 hover:border-rose-500/40 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {/* Delete — for a live or completed match too, e.g. a
                            mis-entered Custom Match. Ratings get rebuilt from
                            scratch afterward, so this stays safe to use. */}
                        {!isScheduled && (
                          <button
                            onClick={() => handleDeleteMatchClick(m)}
                            title="Delete this match"
                            className="p-2.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs border border-slate-700 hover:border-rose-500/40 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Quick Edit Score Button */}
                        <button
                          onClick={() => {
                            setEditingMatchId(m.id);
                            setEditT1(m.score.team1Score || session.rules.pointsToWin);
                            setEditT2(m.score.team2Score || Math.max(0, session.rules.pointsToWin - 3));
                          }}
                          title="Quick Score Entry"
                          className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700 cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Open Scorekeeper / Start on Court */}
                        {m.status === 'scheduled' ? (
                          <button
                            onClick={() => onStartMatch(m.id, m.courtId || '1')}
                            className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Play</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onOpenScorekeeper(m)}
                            className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold text-xs border border-emerald-500/30 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            <span>Score</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Custom Match Creator Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Create a Match</h3>
                <p className="text-xs text-slate-400">Pick 4 players yourself, or let Auto Fill suggest a fair matchup.</p>
              </div>
              <button
                onClick={() => setShowCustomModal(false)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Smart Auto Balance Helper */}
            <div className="bg-emerald-950/30 border border-emerald-500/30 p-3 rounded-xl flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-xs text-emerald-300 font-medium">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Auto-Balance Pairs</span>
              </div>
              <button
                onClick={handleAutoBalanceCustom}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Zap className="w-3 h-3" /> Auto Fill 4
              </button>
            </div>

            {/* Team 1 Selection */}
            <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Team A (Doubles Pair 1)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={customP1}
                  onChange={(e) => setCustomP1(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs text-slate-200"
                >
                  {session.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <select
                  value={customP2}
                  onChange={(e) => setCustomP2(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs text-slate-200"
                >
                  {session.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Team 2 Selection */}
            <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-400">Team B (Doubles Pair 2)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={customP3}
                  onChange={(e) => setCustomP3(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs text-slate-200"
                >
                  {session.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <select
                  value={customP4}
                  onChange={(e) => setCustomP4(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs text-slate-200"
                >
                  {session.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Court Selection */}
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Assign to Court:</span>
              <select
                value={customCourt}
                onChange={(e) => setCustomCourt(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200"
              >
                {session.courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Modal Buttons */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2.5 sm:py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomMatch}
                className="px-4 py-2.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950"
              >
                Add Match to Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
