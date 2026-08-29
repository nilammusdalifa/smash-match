import React, { useEffect, useRef } from 'react';
import { CourtNotification } from '../types/badminton';
import { Bell, X, Sparkles, Coffee, Play, Trophy } from 'lucide-react';

const AUTO_DISMISS_MS = 3000;

interface NotificationsBannerProps {
  notifications: CourtNotification[];
  onDismiss: (id: string) => void;
}

export const NotificationsBanner: React.FC<NotificationsBannerProps> = ({
  notifications,
  onDismiss,
}) => {
  const unread = notifications.filter((n) => !n.read).slice(0, 3);

  // Auto-dismiss each toast a fixed time after it first appears. Timers are
  // tracked per notification id so a re-render doesn't restart the countdown,
  // and cleared if the notification is dismissed (or removed) before it fires.
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = timersRef.current;
    unread.forEach((n) => {
      if (!timers.has(n.id)) {
        timers.set(
          n.id,
          setTimeout(() => {
            timers.delete(n.id);
            onDismiss(n.id);
          }, AUTO_DISMISS_MS)
        );
      }
    });
    timers.forEach((timer, id) => {
      if (!unread.some((n) => n.id === id)) {
        clearTimeout(timer);
        timers.delete(id);
      }
    });
  }, [unread, onDismiss]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  if (unread.length === 0) return null;

  const getIcon = (type: CourtNotification['type']) => {
    switch (type) {
      case 'court_ready':
      case 'match_start':
        return <Play className="w-4 h-4 text-emerald-400 fill-current" />;
      case 'match_completed':
        return <Trophy className="w-4 h-4 text-amber-400" />;
      case 'resting_alert':
        return <Coffee className="w-4 h-4 text-cyan-400" />;
      default:
        return <Bell className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 z-40 sm:max-w-sm w-auto space-y-2 pointer-events-none">
      {unread.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto bg-slate-900/95 border border-emerald-500/40 backdrop-blur-md p-3.5 rounded-2xl shadow-2xl flex items-start justify-between gap-3 animate-in slide-in-from-bottom-5 duration-300"
        >
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
              {getIcon(n.type)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  {n.courtName}
                </span>
                <span className="text-slate-600 text-xs">•</span>
                <h4 className="text-xs font-bold text-white">{n.title}</h4>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-snug">{n.message}</p>
            </div>
          </div>

          <button
            onClick={() => onDismiss(n.id)}
            className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
