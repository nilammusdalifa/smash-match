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
          Mark anyone who isn't here yet. They're skipped in the schedule
          until you mark them back.
        </p>

        <div className="p-5 space-y-2 overflow-y-auto min-h-0">
          {session.players.map((p) => {
            const here = isPresentAt(p, now, session.createdAt);
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className={`flex-1 text-sm truncate ${here ? 'text-white light:text-slate-900' : 'text-slate-500 light:text-slate-400 line-through'}`}>
                  {p.name}
                  <span className="text-[10px] text-slate-500 light:text-slate-400 ml-1.5">{p.skillLevel}</span>
                </span>
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
