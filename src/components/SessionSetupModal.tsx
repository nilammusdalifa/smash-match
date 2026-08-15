import React, { useState } from 'react';
import { Player, GameRules, MatchmakingType, TournamentSession } from '../types/badminton';
import { DEFAULT_RULES, DEFAULT_8_PLAYERS, createNewSession } from '../utils/storage';
import { generateId } from '../utils/scheduler';
import { 
  X, 
  Users, 
  Plus, 
  Trash2, 
  Sparkles, 
  Settings2, 
  Sliders, 
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

interface SessionSetupModalProps {
  onClose: () => void;
  onSessionCreated: (session: TournamentSession) => void;
}

export const SessionSetupModal: React.FC<SessionSetupModalProps> = ({
  onClose,
  onSessionCreated,
}) => {
  const [name, setName] = useState<string>('Friday Night Social Doubles');
  const [courtCount, setCourtCount] = useState<number>(1);
  const [matchmakingType, setMatchmakingType] = useState<MatchmakingType>('rotating_doubles');
  const [pointsToWin, setPointsToWin] = useState<number>(30);
  const [maxPointsCap, setMaxPointsCap] = useState<number>(30);
  const [players, setPlayers] = useState<Player[]>([...DEFAULT_8_PLAYERS]);
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  const [newPlayerSkill, setNewPlayerSkill] = useState<'Beginner' | 'Intermediate' | 'Advanced' | 'Pro'>('Intermediate');
  const [bulkText, setBulkText] = useState<string>('');
  const [showBulkInput, setShowBulkInput] = useState<boolean>(false);

  const handleAddPlayer = () => {
    if (!newPlayerName.trim()) return;
    const newP: Player = {
      id: generateId(),
      name: newPlayerName.trim(),
      initialRating: newPlayerSkill === 'Pro' ? 1280 : newPlayerSkill === 'Advanced' ? 1240 : newPlayerSkill === 'Intermediate' ? 1200 : 1150,
      currentRating: newPlayerSkill === 'Pro' ? 1280 : newPlayerSkill === 'Advanced' ? 1240 : newPlayerSkill === 'Intermediate' ? 1200 : 1150,
      skillLevel: newPlayerSkill,
      gender: 'M',
      active: true,
    };
    setPlayers([...players, newP]);
    setNewPlayerName('');
  };

  const handleRemovePlayer = (id: string) => {
    if (players.length <= 4) {
      alert('You need at least 4 players for a doubles match!');
      return;
    }
    setPlayers(players.filter((p) => p.id !== id));
  };

  const handleApplyBulkPlayers = () => {
    const lines = bulkText.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const imported: Player[] = lines.map((pName) => ({
      id: generateId(),
      name: pName,
      initialRating: 1200,
      currentRating: 1200,
      skillLevel: 'Intermediate',
      active: true,
    }));

    setPlayers(imported);
    setShowBulkInput(false);
    setBulkText('');
  };

  const handleStartTournament = () => {
    if (players.length < 4) {
      alert('A minimum of 4 players is required for doubles badminton.');
      return;
    }

    const rules: GameRules = {
      ...DEFAULT_RULES,
      pointsToWin,
      maxPointsCap,
      winByTwo: true,
      numberOfSets: 1,
    };

    const newSession = createNewSession(
      name.trim() || 'Badminton Doubles Session',
      players,
      courtCount,
      rules,
      matchmakingType
    );

    onSessionCreated(newSession);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-950 px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shrink-0">
              <Settings2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">Create New Tournament Session</h3>
              <p className="text-xs text-slate-400 hidden sm:block">Configure court capacity, players pool, and tournament rules</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-all cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6">
          {/* Tournament Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Session / Event Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Friday Night 8-Player Doubles"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Court Count & Architecture Scalability Slider */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span>Courts Available</span>
              </label>
              <span className="text-sm font-black text-emerald-400 font-mono px-3 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                {courtCount} {courtCount === 1 ? 'Court (Single)' : 'Courts (Multi-Court)'}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {[1, 2, 3, 4, 6].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setCourtCount(cnt)}
                  className={`py-2.5 sm:py-2 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                    courtCount === cnt
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              Set to 1 Court for 8-player rotation. Scalable up to multiple courts when expanding events!
            </p>
          </div>

          {/* Matchmaking Structure */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Matchmaking & Tournament Format
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMatchmakingType('rotating_doubles')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  matchmakingType === 'rotating_doubles'
                    ? 'bg-emerald-950/40 border-emerald-500/60 shadow-lg'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">Rotating Doubles (Social)</span>
                  {matchmakingType === 'rotating_doubles' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Everyone rotates pairs every round so all 8 players partner with each other fairly.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMatchmakingType('fixed_doubles')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  matchmakingType === 'fixed_doubles'
                    ? 'bg-emerald-950/40 border-emerald-500/60 shadow-lg'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">Fixed Doubles Teams</span>
                  {matchmakingType === 'fixed_doubles' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </div>
                <p className="text-[11px] text-slate-400">
                  Fixed 2-person doubles teams playing a round-robin schedule against all other pairs.
                </p>
              </button>
            </div>
          </div>

          {/* Scoring Rules */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Points to Win
              </label>
              <select
                value={pointsToWin}
                onChange={(e) => setPointsToWin(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value={30}>30 Points (Single Game Sudden Death)</option>
                <option value={21}>21 Points (Standard BWF)</option>
                <option value={15}>15 Points (Fast Rally)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Max Point Cap
              </label>
              <select
                value={maxPointsCap}
                onChange={(e) => setMaxPointsCap(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value={30}>30 Points Cap</option>
                <option value={21}>No deuce (First to target)</option>
              </select>
            </div>
          </div>

          {/* Player Roster Manager */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Player Roster ({players.length} Players)</span>
              </label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowBulkInput(!showBulkInput)}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  {showBulkInput ? 'Single Input' : 'Bulk Paste Names'}
                </button>
                <button
                  type="button"
                  onClick={() => setPlayers([...DEFAULT_8_PLAYERS])}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Load 8 Sample
                </button>
              </div>
            </div>

            {/* Bulk Text Area */}
            {showBulkInput ? (
              <div className="space-y-2 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <textarea
                  rows={4}
                  placeholder="Paste player names separated by newlines or commas..."
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handleApplyBulkPlayers}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold"
                >
                  Apply Names
                </button>
              </div>
            ) : (
              /* Add Single Player Input */
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="New Player Name..."
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddPlayer();
                    }
                  }}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 sm:py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex gap-2">
                  <select
                    value={newPlayerSkill}
                    onChange={(e) => setNewPlayerSkill(e.target.value as any)}
                    className="flex-1 sm:flex-none bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2.5 sm:py-2 text-xs text-slate-300"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Pro">Pro</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddPlayer}
                    className="px-4 py-2.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            )}

            {/* Players Pill List */}
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
              {players.map((p, idx) => (
                <div
                  key={p.id}
                  className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs"
                >
                  <span className="font-mono text-slate-500 text-[10px]">{idx + 1}.</span>
                  <span className="font-semibold text-white">{p.name}</span>
                  <span className="text-[10px] text-slate-400">({p.skillLevel})</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePlayer(p.id)}
                    className="text-slate-500 hover:text-rose-400 ml-1 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-950 px-4 sm:px-6 py-4 border-t border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 sm:py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStartTournament}
            className="px-5 py-2.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate & Launch Tournament</span>
          </button>
        </div>
      </div>
    </div>
  );
};
