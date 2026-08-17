import React, { useState, useEffect } from 'react';
import { Match, GameRules } from '../types/badminton';
import { soundManager } from '../utils/audio';
import confetti from 'canvas-confetti';
import { 
  X, 
  RotateCcw, 
  ArrowLeftRight, 
  Trophy, 
  Sparkles, 
  ShieldAlert,
  Volume2,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface ScorekeeperModalProps {
  match: Match | null;
  rules: GameRules;
  onClose: () => void;
  onSaveAndFinish: (matchId: string, team1Score: number, team2Score: number) => void;
  onUpdateScore: (matchId: string, team1Score: number, team2Score: number) => void;
}

export const ScorekeeperModal: React.FC<ScorekeeperModalProps> = ({
  match,
  rules,
  onClose,
  onSaveAndFinish,
  onUpdateScore,
}) => {
  if (!match) return null;

  const [t1Score, setT1Score] = useState<number>(match.score.team1Score || 0);
  const [t2Score, setT2Score] = useState<number>(match.score.team2Score || 0);
  const [servingTeam, setServingTeam] = useState<1 | 2>(1);
  const [scoreHistory, setScoreHistory] = useState<Array<{ t1: number; t2: number; server: 1 | 2 }>>([
    { t1: match.score.team1Score || 0, t2: match.score.team2Score || 0, server: 1 },
  ]);
  const [swappedEnds, setSwappedEnds] = useState<boolean>(false);
  const [intervalAnnounced, setIntervalAnnounced] = useState<boolean>(false);

  // Sync initial state if match changes
  useEffect(() => {
    setT1Score(match.score.team1Score || 0);
    setT2Score(match.score.team2Score || 0);
  }, [match]);

  const targetScore = rules.pointsToWin;
  const maxCap = rules.maxPointsCap;

  // Determine if match point or game win
  const isTeam1MatchPoint = t1Score >= targetScore - 1 && (t1Score > t2Score || t1Score === maxCap - 1);
  const isTeam2MatchPoint = t2Score >= targetScore - 1 && (t2Score > t1Score || t2Score === maxCap - 1);

  const isTeam1Won = t1Score >= targetScore && (t1Score - t2Score >= 2 || t1Score >= maxCap);
  const isTeam2Won = t2Score >= targetScore && (t2Score - t1Score >= 2 || t2Score >= maxCap);
  const isGameOver = isTeam1Won || isTeam2Won;

  // Interval check (scales with the game's actual point target, e.g. 11 for a 21-pt game, 15 for a 30-pt game)
  const intervalScore = rules.changeEndsAtScore || Math.ceil(targetScore / 2);
  useEffect(() => {
    if (!intervalAnnounced && (t1Score === intervalScore || t2Score === intervalScore)) {
      setIntervalAnnounced(true);
      soundManager.playWhistle();
      soundManager.announce(`Interval! ${t1Score} to ${t2Score}. 60 seconds interval.`);
    }
  }, [t1Score, t2Score, intervalAnnounced, intervalScore]);

  // Handle scoring a point
  const addPoint = (team: 1 | 2) => {
    if (isGameOver) return;

    soundManager.playPointChime(team);
    let nextT1 = t1Score;
    let nextT2 = t2Score;

    if (team === 1) {
      nextT1 += 1;
    } else {
      nextT2 += 1;
    }

    setT1Score(nextT1);
    setT2Score(nextT2);
    setServingTeam(team);
    setScoreHistory((prev) => [...prev, { t1: nextT1, t2: nextT2, server: team }]);
    onUpdateScore(match.id, nextT1, nextT2);

    // Announce score
    const serverScore = team === 1 ? nextT1 : nextT2;
    const receiverScore = team === 1 ? nextT2 : nextT1;
    
    // Check win condition
    const t1Wins = nextT1 >= targetScore && (nextT1 - nextT2 >= 2 || nextT1 >= maxCap);
    const t2Wins = nextT2 >= targetScore && (nextT2 - nextT1 >= 2 || nextT2 >= maxCap);

    if (t1Wins || t2Wins) {
      soundManager.playFanfare();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
      const winnerName = t1Wins 
        ? `${match.team1.player1.name} and ${match.team1.player2.name}`
        : `${match.team2.player1.name} and ${match.team2.player2.name}`;
      soundManager.announce(`Game! Won by ${winnerName}. Score: ${nextT1} to ${nextT2}.`);
    } else if (nextT1 >= targetScore - 1 || nextT2 >= targetScore - 1) {
      soundManager.announce(`Match Point! ${serverScore} serving ${receiverScore}.`);
    }
  };

  const handleUndo = () => {
    if (scoreHistory.length <= 1) return;
    const nextHist = scoreHistory.slice(0, -1);
    const last = nextHist[nextHist.length - 1];
    setT1Score(last.t1);
    setT2Score(last.t2);
    setServingTeam(last.server);
    setScoreHistory(nextHist);
    onUpdateScore(match.id, last.t1, last.t2);
  };

  const handleSwapEnds = () => {
    setSwappedEnds(!swappedEnds);
    soundManager.playWhistle();
    soundManager.announce("Change ends.");
  };

  const handleFinishMatch = () => {
    soundManager.playFanfare();
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.5 },
    });
    onSaveAndFinish(match.id, t1Score, t2Score);
    onClose();
  };

  // Service court logic in Doubles (Even = Right service court, Odd = Left service court)
  const currentServingScore = servingTeam === 1 ? t1Score : t2Score;
  const isServingFromRight = currentServingScore % 2 === 0;

  // Left vs Right teams on screen (respects swap ends)
  const leftTeamNum = swappedEnds ? 2 : 1;
  const rightTeamNum = swappedEnds ? 1 : 2;
  const leftTeam = leftTeamNum === 1 ? match.team1 : match.team2;
  const rightTeam = rightTeamNum === 1 ? match.team1 : match.team2;
  const leftScore = leftTeamNum === 1 ? t1Score : t2Score;
  const rightScore = rightTeamNum === 1 ? t1Score : t2Score;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[98vh] sm:max-h-[95vh]">
        {/* Header Bar */}
        <div className="bg-slate-950 px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shrink-0">
              {match.courtId || '1'}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">Umpire Scoreboard</h3>
                <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono whitespace-nowrap shrink-0">
                  R{match.roundNumber} • #{match.matchNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block truncate">
                {match.courtName || 'Court 1'} • {targetScore} points to win (cap {maxCap})
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => soundManager.announce(`Score is ${t1Score} to ${t2Score}.`)}
              title="Speak Current Score"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition-all cursor-pointer"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Match Point / Game Status Banner */}
        {isGameOver ? (
          <div className="bg-emerald-500/20 border-b border-emerald-500/40 py-2.5 px-4 text-center">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 animate-pulse">
              <Trophy className="w-4 h-4" /> Match Finished! Winner:{' '}
              {isTeam1Won
                ? `${match.team1.player1.name} & ${match.team1.player2.name}`
                : `${match.team2.player1.name} & ${match.team2.player2.name}`}
            </span>
          </div>
        ) : (isTeam1MatchPoint || isTeam2MatchPoint) ? (
          <div className="bg-amber-500/20 border-b border-amber-500/40 py-2 px-4 text-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300 animate-bounce">
              <Sparkles className="w-3.5 h-3.5" /> Match Point (Rally to Win!)
            </span>
          </div>
        ) : null}

        {/* Main Score & Court Stage */}
        <div className="p-4 sm:p-8 flex-1 overflow-y-auto flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 items-stretch">
            {/* Left Court Team */}
            <div 
              className={`rounded-3xl p-6 sm:p-8 border-2 transition-all flex flex-col justify-between relative overflow-hidden ${
                servingTeam === leftTeamNum 
                  ? 'bg-slate-800/90 border-emerald-500/60 shadow-xl shadow-emerald-950/40' 
                  : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              {servingTeam === leftTeamNum && (
                <div className="absolute top-4 right-4 flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Serving ({isServingFromRight ? 'Right Box' : 'Left Box'})
                </div>
              )}

              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400/90 mb-1">
                  Team {leftTeamNum === 1 ? 'A' : 'B'}
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white truncate">
                  {leftTeam.player1.name}
                </div>
                <div className="text-lg sm:text-xl font-bold text-slate-300 truncate mt-0.5">
                  {leftTeam.player2.name}
                </div>
              </div>

              {/* Big Score Display */}
              <div className="my-6 text-center">
                <div className="font-mono font-black text-6xl sm:text-8xl text-white tracking-tighter">
                  {leftScore}
                </div>
              </div>

              {/* Big Tap Point Button */}
              <button
                id={`btn-point-team-${leftTeamNum}`}
                disabled={isGameOver}
                onClick={() => addPoint(leftTeamNum as 1 | 2)}
                className={`w-full py-4 sm:py-5 rounded-2xl font-extrabold text-base sm:text-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 cursor-pointer ${
                  isGameOver
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 hover:shadow-emerald-900/70'
                }`}
              >
                <span>+1 Point (Team {leftTeamNum === 1 ? 'A' : 'B'})</span>
              </button>
            </div>

            {/* Right Court Team */}
            <div 
              className={`rounded-3xl p-6 sm:p-8 border-2 transition-all flex flex-col justify-between relative overflow-hidden ${
                servingTeam === rightTeamNum 
                  ? 'bg-slate-800/90 border-teal-500/60 shadow-xl shadow-teal-950/40' 
                  : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              {servingTeam === rightTeamNum && (
                <div className="absolute top-4 right-4 flex items-center gap-1 text-xs font-bold text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-full border border-teal-500/30">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping"></span>
                  Serving ({isServingFromRight ? 'Right Box' : 'Left Box'})
                </div>
              )}

              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-teal-400/90 mb-1">
                  Team {rightTeamNum === 1 ? 'A' : 'B'}
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white truncate">
                  {rightTeam.player1.name}
                </div>
                <div className="text-lg sm:text-xl font-bold text-slate-300 truncate mt-0.5">
                  {rightTeam.player2.name}
                </div>
              </div>

              {/* Big Score Display */}
              <div className="my-6 text-center">
                <div className="font-mono font-black text-6xl sm:text-8xl text-white tracking-tighter">
                  {rightScore}
                </div>
              </div>

              {/* Big Tap Point Button */}
              <button
                id={`btn-point-team-${rightTeamNum}`}
                disabled={isGameOver}
                onClick={() => addPoint(rightTeamNum as 1 | 2)}
                className={`w-full py-4 sm:py-5 rounded-2xl font-extrabold text-base sm:text-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 cursor-pointer ${
                  isGameOver
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-500 text-white shadow-teal-900/40 hover:shadow-teal-900/70'
                }`}
              >
                <span>+1 Point (Team {rightTeamNum === 1 ? 'A' : 'B'})</span>
              </button>
            </div>
          </div>

          {/* Quick Service Box Guide */}
          <div className="mt-4 bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Service Rule:</strong> Serving team score ({currentServingScore}) is{' '}
                {isServingFromRight ? 'EVEN → Serve from RIGHT court' : 'ODD → Serve from LEFT court'}.
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-slate-500">
              <span>Score History: {scoreHistory.length - 1} rallies</span>
            </div>
          </div>
        </div>

        {/* Umpire Controls Footer */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              id="btn-undo-point"
              onClick={handleUndo}
              disabled={scoreHistory.length <= 1}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Undo Point</span>
            </button>

            <button
              id="btn-swap-ends"
              onClick={handleSwapEnds}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
              <span>Swap Ends</span>
            </button>

            <button
              id="btn-toggle-server"
              onClick={() => setServingTeam(servingTeam === 1 ? 2 : 1)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
            >
              <span>Switch Server (Team {servingTeam === 1 ? 'B' : 'A'})</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="btn-modal-finish-match"
              onClick={handleFinishMatch}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Complete & Record Result</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
