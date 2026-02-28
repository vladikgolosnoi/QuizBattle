export type TeamId = 'A' | 'B'
export type GameFormat = 'teams' | 'ffa'
export type DifficultyMode = 'mixed' | 'easy' | 'medium' | 'hard'

export type RoomStatus = 'lobby' | 'preparing' | 'running' | 'paused' | 'finished'

export interface ParticipantView {
  id: string
  name: string
  team: TeamId | 'HOST'
  isHost: boolean
}

export interface Submission {
  type: 'answer' | 'timeout' | 'skip' | 'pass'
  byName: string
  answerIndex: number | null
  correct: boolean
  points: number
  elapsedMs: number
  expectedCorrectIndex: number | null
}

export interface QuestionImage {
  url: string
  width: number
  height: number
  sourceUrl: string
  sourceTitle: string
  provider: 'wikipedia' | 'pexels' | 'commons'
}

export interface ActiveQuestion {
  id: string
  text: string
  options: string[] | null
  difficulty: 'easy' | 'medium' | 'hard'
  image: QuestionImage | null
}

export interface ActiveRound {
  key: string
  team: TeamId
  playerId: string | null
  playerName: string | null
  roundNumber: number
  totalRounds: number
  questionNumberInTeam: number
  roundDurationMs: number
  question: ActiveQuestion | null
  timeLeftMs: number
  canAnswer: boolean
  locked: boolean
  teamVoting: {
    total: number
    submitted: number
    optionVotes: number[]
    passVotes: number
    myVoteIndex: number | null
    myPassed: boolean
  } | null
  currentSubmission: Submission | null
}

export interface LastRoundSummary {
  team: TeamId
  playerId: string | null
  playerName: string | null
  question: string
  correctIndex: number
  correctOption: string
  explanation: string
  image: QuestionImage | null
  submission: Submission
}

export interface RoundHistoryItem {
  id: string
  roundNumber: number
  totalRounds: number
  team: TeamId
  playerId: string | null
  playerName: string | null
  questionId: string
  question: string
  options: string[]
  correctIndex: number
  correctOption: string
  explanation: string
  difficulty: 'easy' | 'medium' | 'hard'
  image: QuestionImage | null
  submission: Submission
}

export interface RoomState {
  pin: string
  inviteLink: string
  theme: string
  format: GameFormat
  gameMode: {
    key: string
    label: string
    format: GameFormat
    passEnabled: boolean
    speedBonusForced: boolean
    timerMultiplier: number
    streakBonus: boolean
    bonusCorrect: number
  }
  selectedModes: string[]
  audience: {
    key: string
    label: string
  }
  tone: {
    key: string
    label: string
  }
  difficultyMode: DifficultyMode
  speedBonusEnabled: boolean
  hasPassword: boolean
  aiMode: 'auto' | 'free' | 'openai' | 'yandex' | 'gigachat' | 'hybrid' | 'synthetic'
  status: RoomStatus
  provider: 'openai' | 'groq' | 'gemini' | 'yandex' | 'gigachat' | 'hybrid' | 'synthetic'
  providerLabel: string
  questionCount: number
  generation: {
    ready: number
    total: number
    inFlight: boolean
    error: string | null
  }
  timerSeconds: number
  hostOnline: boolean
  hostReconnectDeadlineAt: number
  me: ParticipantView | null
  participants: ParticipantView[]
  scores: Record<TeamId, number>
  teams: Record<TeamId, { name: string; members: number }>
  activeRound: ActiveRound | null
  lastRoundSummary: LastRoundSummary | null
  roundHistory: RoundHistoryItem[]
  timeline: string[]
  hardestQuestions: Array<{
    id: string
    team: TeamId
    question: string
    wrong: number
    timeouts: number
    correct: number
    total: number
    pain: number
  }>
  playerStats: Array<{
    id: string
    name: string
    team: TeamId
    answers: number
    correct: number
    wrong: number
    timeouts: number
    skips: number
    points: number
    accuracy: number
    joinedAt: number
    leftAt: number | null
    connected: boolean
    disqualified: boolean
  }>
  ffaLeaderboard: Array<{
    id: string
    name: string
    team: TeamId
    points: number
    correct: number
    answers: number
    accuracy: number
    connected: boolean
    disqualified: boolean
  }>
  teamMetrics: Record<TeamId, { timeouts: number; skips: number }>
  lastExport: {
    fileName: string
    filePath: string
    exportedAt: number
    trigger: string
  } | null
  resultHeadline: string
  serverTime: number
  rules: {
    passEnabled: boolean
  }
}
