// ── API Types ───────────────────────────────────────────────────────

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  userId: number;
  email: string;
  username: string;
  role: string;
  emailResultsOptIn: boolean;
}

export interface Club {
  id: number;
  name: string;
  description: string | null;
  clubAdminId: number | null;
  clubAdminUsername: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
}

export interface StripeConnectStatus {
  stripeAccountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export interface Competition {
  id: number;
  name: string;
  description?: string;
  entryFee: number;
  prizePool?: number;
  passFeeToParticipant?: boolean;
  paymentMode?: 'FREE' | 'MANUAL' | 'STRIPE';
  manualPaymentPolicy?: 'STRICT' | 'LENIENT';
  visibility?: 'PUBLIC' | 'PRIVATE';
  joinCode?: string;
  status: string;
  missedPickMode: string;
  postponedConsumesTeam: boolean;
  startDate: string;
  firstGameweekDate?: string;
  createdByUsername: string;
  participantCount: number;
  activeCount: number;
  clubId?: number;
  clubName?: string;
  winnerUsername?: string;
  clubPrimaryColor?: string | null;
  clubSecondaryColor?: string | null;
  clubLogoUrl?: string | null;
}

export interface Participant {
  id: number;
  userId: number;
  username: string;
  status: 'ACTIVE' | 'ELIMINATED' | 'WINNER';
  paymentState?: 'NOT_REQUIRED' | 'AWAITING_PAYMENT' | 'PAID';
  eliminatedWeek: number | null;
  joinedAt: string;
}

export interface MyStatus {
  participant: Participant;
  usedTeamIds: number[];
  picks: PickHistoryItem[];
}

export interface MyCompetition {
  competition: Competition;
  myStatus: 'ACTIVE' | 'ELIMINATED' | 'WINNER';
  paymentState?: 'NOT_REQUIRED' | 'AWAITING_PAYMENT' | 'PAID';
  eliminatedWeek: number | null;
  joinedAt: string;
}

export interface PickHistoryItem {
  pickId: number;
  gameweekId: number;
  weekNumber: number;
  teamId: number;
  teamName: string;
  teamShortName: string;
  source: 'USER' | 'AUTO';
  locked: boolean;
  pickedAt: string;
  outcome: 'PENDING' | 'ADVANCE' | 'ELIMINATED' | 'POSTPONED_ADVANCE';
  resolvedAt: string | null;
}

export interface GameweekResponse {
  id: number;
  weekNumber: number;
  lockAt: string;
  startsAt: string;
  endsAt: string;
  status: 'UPCOMING' | 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface Fixture {
  id: number;
  gameweekId: number;
  weekNumber: number;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamShortName: string;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamShortName: string;
  kickoffAt: string;
  status: 'SCHEDULED' | 'IN_PLAY' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  scoreHome: number | null;
  scoreAway: number | null;
  hasOverride: boolean;
  gameweekLockAt: string;
  gameweekStatus: 'UPCOMING' | 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface PickResponse {
  id: number;
  gameweekId: number;
  weekNumber: number;
  teamId: number;
  teamName: string;
  teamShortName: string;
  source: 'USER' | 'AUTO';
  locked: boolean;
  pickedAt: string;
}

export interface GameweekSelection {
  userId: number;
  username: string;
  teamId: number;
  teamName: string;
  teamShortName: string;
  source: 'USER' | 'AUTO';
  outcome: string;
}

export interface GameweekSelectionsData {
  selections: GameweekSelection[];
  byeGranted: boolean;
  weekNumber: number;
  activeAtStart?: number;
  advancedThisWeek?: number;
  eliminatedThisWeek?: number;
}

export interface Team {
  id: number;
  name: string;
  shortName: string;
  logoUrl: string | null;
}

export interface AuditLog {
  id: number;
  username: string | null;
  entityType: string;
  entityId: number;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  action: string;
  createdAt: string;
}
