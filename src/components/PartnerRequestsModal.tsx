import React, { useState } from 'react';
import { TournamentSession } from '../types/badminton';
import { X, Plus, Trash2, HeartHandshake } from 'lucide-react';

interface PartnerRequestsModalProps {
  session: TournamentSession;
  onSetRequestedPairs: (pairs: Array<[string, string]>) => void;
  onClose: () => void;
}

export const PartnerRequestsModal: React.FC<PartnerRequestsModalProps> = ({
  session,
  onSetRequestedPairs,
  onClose,
}) => {
  const pairs = session.requestedPairs || [];
  const [a, setA] = useState<string>(session.players[0]?.id || '');
  const [b, setB] = useState<string>(session.players[1]?.id || '');

  const nameOf = (id: string) => session.players.find((p) => p.id === id)?.name || '?';

  const handleAdd = () => {
    if (!a || !b || a === b) {
      alert('Pick two different players.');
      return;
    }
    const key = [a, b].sort().join('-');
    if (pairs.some((p) => [p[0], p[1]].sort().join('-') === key)) {
      alert('That pair is already requested.');
      return;
    }
    onSetRequestedPairs([...pairs, [a, b]]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Partner Requests</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-5 pt-3 text-xs text-slate-400">
          Each pair gets put together once, as early as both are here.
        </p>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="flex items-center gap-2">
            <select
              value={a}
              onChange={(e) => setA(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-200"
            >
              {session.players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className="text-slate-500 text-xs">+</span>
            <select
              value={b}
              onChange={(e) => setB(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-200"
            >
              {session.players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {pairs.length === 0 ? (
            <p className="text-xs text-slate-500">No requests yet.</p>
          ) : (
            pairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-2 bg-slate-950/60 rounded-xl px-3 py-2">
                <HeartHandshake className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="flex-1 text-xs text-slate-200 truncate">
                  {nameOf(pair[0])} + {nameOf(pair[1])}
                </span>
                <button
                  onClick={() => onSetRequestedPairs(pairs.filter((_, idx) => idx !== i))}
                  className="text-slate-500 hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
