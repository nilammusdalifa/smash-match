import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Player, TournamentSession } from '../types/badminton';
import { X, Plus, Trash2, HeartHandshake, ChevronDown } from 'lucide-react';

interface PartnerRequestsModalProps {
  session: TournamentSession;
  onSetRequestedPairs: (pairs: Array<[string, string]>) => void;
  onClose: () => void;
}

interface PlayerPickerProps {
  players: Player[];
  value: string;
  onChange: (id: string) => void;
}

const PlayerPicker: React.FC<PlayerPickerProps> = ({ players, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = players.find((p) => p.id === value);

  // The list is portaled to <body> (see render below) so the modal's own
  // overflow-y-auto scroll area can't clip it — position it with the
  // button's actual screen coordinates instead of relying on CSS layout.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        listRef.current && !listRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    // Scroll capture fires for scrolling inside the list itself too (that's
    // the whole point of the list) — only close for a scroll elsewhere,
    // which means the button's on-screen position is no longer valid.
    const handleScroll = (e: Event) => {
      if (listRef.current && listRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="flex-1">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-1 bg-slate-950 light:bg-slate-50 border border-slate-700 light:border-slate-300 rounded-xl p-2 text-xs text-slate-200 light:text-slate-700 cursor-pointer"
      >
        <span className="truncate">{selected?.name || 'Pick a player'}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 light:text-slate-400 shrink-0" />
      </button>
      {open && rect && createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="max-h-48 overflow-y-auto rounded-xl bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 shadow-xl z-[60]"
        >
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs cursor-pointer hover:bg-slate-800 light:hover:bg-slate-100 ${
                p.id === value ? 'text-emerald-300 light:text-emerald-700' : 'text-slate-200 light:text-slate-700'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

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
      <div className="bg-slate-900 light:bg-white border border-slate-700 light:border-slate-300 w-full max-w-sm rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 border-b border-slate-800 light:border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white light:text-slate-900">Partner Requests</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 light:bg-slate-100 text-slate-400 light:text-slate-500 hover:text-white light:hover:text-slate-900">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-5 pt-3 text-xs text-slate-400 light:text-slate-500">
          They'll play together once, as soon as both are here.
        </p>

        <div className="p-5 space-y-3 overflow-y-auto min-h-0">
          <div className="flex items-center gap-2">
            <PlayerPicker players={session.players} value={a} onChange={setA} />
            <span className="text-slate-500 light:text-slate-400 text-xs">+</span>
            <PlayerPicker players={session.players} value={b} onChange={setB} />
            <button
              onClick={handleAdd}
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {pairs.length === 0 ? (
            <p className="text-xs text-slate-500 light:text-slate-400">No requests yet.</p>
          ) : (
            pairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-2 bg-slate-950/60 light:bg-slate-50 rounded-xl px-3 py-2">
                <HeartHandshake className="w-3.5 h-3.5 text-emerald-400 light:text-emerald-600 shrink-0" />
                <span className="flex-1 text-xs text-slate-200 light:text-slate-700 truncate">
                  {nameOf(pair[0])} + {nameOf(pair[1])}
                </span>
                <button
                  onClick={() => onSetRequestedPairs(pairs.filter((_, idx) => idx !== i))}
                  className="text-slate-500 light:text-slate-400 hover:text-rose-400 light:hover:text-rose-600 cursor-pointer"
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
