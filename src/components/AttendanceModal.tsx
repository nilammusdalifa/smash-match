import React from 'react';
import { TournamentSession } from '../types/badminton';
import { isPresentAt } from '../utils/fairness';
import { X, UserCheck, UserX } from 'lucide-react';

interface AttendanceModalProps {
  session: TournamentSession;
  onSetPlayerPresence: (playerId: string, present: boolean) => void;
  onClose: () => void;
}

export const AttendanceModal: React.FC<AttendanceModalProps> = ({
  session,
  onSetPlayerPresence,
  onClose,
}) => {
  const now = Date.now();
  const presentCount = session.players.filter(
    (p) => p.active && isPresentAt(p, now, session.createdAt)
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">
            Who's here <span className="text-slate-400 font-mono">({presentCount}/{session.players.length})</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-5 pt-3 text-xs text-slate-400">
          Everyone starts as here. Mark anyone who hasn't arrived — they're
          left out of matches until you mark them back.
        </p>

        <div className="p-5 space-y-2 overflow-y-auto min-h-0">
          {session.players.map((p) => {
            const here = isPresentAt(p, now, session.createdAt);
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className={`flex-1 text-sm truncate ${here ? 'text-white' : 'text-slate-500 line-through'}`}>
                  {p.name}
                  <span className="text-[10px] text-slate-500 ml-1.5">{p.skillLevel}</span>
                </span>
                <button
                  onClick={() => onSetPlayerPresence(p.id, !here)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    here
                      ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
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
