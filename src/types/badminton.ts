export type MatchStatus = 'scheduled' | 'in_progress' | 'completed';

export type MatchmakingType =
  | 'rotating_doubles' // Social American round robin (partners rotate every round)
  | 'fixed_doubles';   // Fixed 2-person teams round robin / brackets

export interface Player {
  id: string;
  name: string;
  avatar?: string;
  initialRating: number;
  currentRating: number;
  gender?: 'M' | 'F' | 'Other';
  skillLevel?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Pro';
  active: boolean;
  notes?: string;
}

export interface MatchScore {
  team1Score: number;
  team2Score: number;
  isCompleted: boolean;
  history?: Array<{
    team1: number;
    team2: number;
    scoredByTeam: 1 | 2;
    timestamp: number;
  }>;
  winnerTeamId?: 1 | 2;
  sets?: Array<{ team1: number; team2: number }>;
}

export interface Match {
  id: string;
  roundNumber: number;
  matchNumber: number;
  courtId?: string;
  courtName?: string;
  team1: {
    player1: Player;
    player2: Player;
  };
  team2: {
    player1: Player;
    player2: Player;
  };
  score: MatchScore;
  status: MatchStatus;
  startTime?: number;
  endTime?: number;
  durationSeconds?: number;
  restingPlayerIds?: string[];
}

export interface Court {
  id: string;
  name: string;
  isActive: boolean;
  currentMatchId?: string;
  nextMatchId?: string;
}

export interface GameRules {
  pointsToWin: number;       // e.g. 21, 15, 30
  winByTwo: boolean;         // true for standard BWF
  maxPointsCap: number;      // e.g. 30 for 21-pt, or 17 for 15-pt
  numberOfSets: number;      // usually 1 set for social round-robin, 3 for tournament
  suddenDeathAtCap: boolean;
  changeEndsAtScore?: number; // e.g. 11 for 21-pt game
}

export interface TournamentSession {
  id: string;
  name: string;
  date: string;
  createdAt: number;
  courtCount: number;
  courts: Court[];
  players: Player[];
  matchmakingType: MatchmakingType;
  rules: GameRules;
  matches: Match[];
  currentRound: number;
  totalRounds: number;
  isCompleted: boolean;
}

export interface PlayerStats {
  player: Player;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRate: number; // 0 to 100
  pointsScored: number;
  pointsConceded: number;
  pointDiff: number;
  rating: number;
  ratingChange: number;
  form: ('W' | 'L')[];
  rank: number;
  favoritePartner?: {
    partner: Player;
    winRate: number;
    playedTogether: number;
  };
  toughOpponent?: {
    opponent: Player;
    lossRate: number;
    playedAgainst: number;
  };
}

export interface CourtNotification {
  id: string;
  title: string;
  message: string;
  courtName: string;
  type: 'court_ready' | 'match_start' | 'match_completed' | 'on_deck' | 'resting_alert';
  timestamp: number;
  read: boolean;
  speechText?: string;
}
