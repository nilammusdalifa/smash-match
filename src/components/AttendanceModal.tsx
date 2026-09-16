import React from 'react';
import { TournamentSession, Player } from '../types/badminton';
import { isPresentAt } from '../utils/fairness';
import { X, UserCheck, UserX, LogIn } from 'lucide-react';

interface AttendanceModalProps {
  session: TournamentSession;
  onSetPlayerPresence: (playerId: string, present: boolean) => void;
  onMarkJustArrived: (playerId: string) => void;
  onClose: () => void;
}

export const AttendanceModal: React.FC<AttendanceModalProps> = ({
  session,
  onSetPlayerPresence,
  onMarkJustArrived,
  onClose,
}) => {
  const now = Date.now();
  const presentCount = session.players.filter(
    (p) => p.active && isPresentAt(p, now, session.createdAt)
  ).length;

  // The lowest matchNumber among matches that actually started at/after this
  // player's arrival — omitted if nothing has started since they arrived
  // (including the common case of "present since session start").
  const joinedAtMatchNumber = (p: Player): number | null => {
    if (p.arrivedAt === undefined) return null;
    const since = session.matches
      .filter((m) => m.status !== 'scheduled' && m.startTime !== undefined && m.startTime >= p.arrivedAt!)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    return since.length > 0 ? since[0].matchNumber : null;
  };

  // Play has to have actually started before "Baru datang" means anything —
  // showing it for everyone at session start would just be noise.
  const playHasStarted = session.matches.some((m) => m.status !== 'scheduled');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 w-full max-w-sm rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 border-b border-slate-800 light:border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white light:text-slate-900">
            Who's here <span className="text-slate-400 light:text-slate-500 font-mono">({presentCount}/{session.players.length})</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-500 hover:text-white light:hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-5 pt-3 text-xs text-slate-400 light:text-slate-500">
          Mark people here as they arrive — matches start once 4 are in.
        </p>

        <div className="p-5 space-y-2 overflow-y-auto min-h-0">
          {session.players.map((p) => {
            const here = isPresentAt(p, now, session.createdAt);
            const joinedAt = joinedAtMatchNumber(p);
            const showJustArrived = playHasStarted && here && p.arrivedAt === undefined;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`block text-sm truncate ${here ? 'text-white light:text-slate-900' : 'text-slate-500 light:text-slate-400 line-through'}`}>
                    {p.name}
                    <span className="text-[10px] text-slate-500 light:text-slate-400 ml-1.5">{p.skillLevel}</span>
                  </span>
                  {joinedAt !== null && (
                    <span className="text-[10px] text-slate-500 light:text-slate-400">joined at match #{joinedAt}</span>
                  )}
                </div>
                {showJustArrived && (
                  <button
                    onClick={() => onMarkJustArrived(p.id)}
                    title="Stamp their real arrival time so they stop being credited for time they missed"
                    className="px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1 bg-amber-600/10 light:bg-amber-50 border-amber-500/30 light:border-amber-300 text-amber-300 light:text-amber-700"
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Baru datang</span>
                  </button>
                )}
                <button
                  onClick={() => onSetPlayerPresence(p.id, !here)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    here
                      ? 'bg-emerald-600/20 light:bg-emerald-100 border-emerald-500/40 light:border-emerald-300 text-emerald-300 light:text-emerald-700'
                      : 'bg-slate-800 light:bg-slate-100 border-slate-700 light:border-slate-300 text-slate-400 light:text-slate-500'
                  }`}
                >
                  {here ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                  <span>{here ? 'Here' : 'Away'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
