import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, FormEvent } from 'react'
import clsx from 'clsx'
import { io, Socket } from 'socket.io-client'
import type { DifficultyMode, GameFormat, RoomState, Submission, TeamId } from './types'

const resolveDefaultServerUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:4000'
  const { hostname, port, origin } = window.location
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'
  const isVitePort = port === '5173' || port === '5175'
  if (isLocal && isVitePort) return 'http://localhost:4000'
  return origin
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || resolveDefaultServerUrl()
const SESSION_STORAGE_KEY = 'quizbattle:session'
const AUTH_TOKEN_STORAGE_KEY = 'quizbattle:authToken'
const LANDING_PAGE_STORAGE_KEY = 'quizbattle:landingPage'

type LobbyMode = 'host' | 'join'
type AudienceMode = 'universal' | 'students' | 'hackathons' | 'teachers' | 'corporate'
type ToneMode = 'balanced' | 'fun' | 'challenge'
type UiTheme = 'light' | 'dark'
type GameplayModeId = 'team_battle' | 'duel_1v1' | 'solo_arena' | 'turbo_storm' | 'combo_rush'
type LandingPage = 'play' | 'rooms' | 'account' | 'community' | 'leaderboard' | 'history'
type FriendshipStatus = 'self' | 'none' | 'accepted' | 'pending_outgoing' | 'pending_incoming'

type StoredSession = {
  role: 'host' | 'player'
  pin: string
  name: string
  hostKey?: string
  playerKey?: string
  roomPassword?: string
}

const difficultyLabel = {
  easy: 'Легко',
  medium: 'Средне',
  hard: 'Сложно',
}

const difficultyModeLabel: Record<DifficultyMode, string> = {
  mixed: 'Смешанная',
  easy: 'Легкая',
  medium: 'Средняя',
  hard: 'Сложная',
}

const teamTitle: Record<TeamId, string> = {
  A: 'Команда A',
  B: 'Команда B',
}

const teamEmoji: Record<TeamId, string> = {
  A: '🦀',
  B: '👸',
}

const answerGlyph = ['A', 'B', 'C', 'D']

const roomStatusLabel: Record<string, string> = {
  lobby: 'Лобби',
  running: 'Идет игра',
  paused: 'Пауза',
  finished: 'Завершена',
}

type LeaderboardItem = {
  username: string
  displayName: string
  avatarUrl: string
  rating: number
  wins: number
  gamesPlayed: number
  totalPoints: number
}

type HistoryItem = {
  id: number
  pin: string
  theme: string
  format: 'teams' | 'ffa'
  status: string
  winner: string
  scoreA: number
  scoreB: number
  participants: number
  exportFile: string
  finishedAt: number
}

type UserProfile = {
  id: number
  username: string
  displayName: string
  firstName: string
  lastName: string
  nickname: string
  age: number | null
  activity: string
  avatarUrl: string
  bio: string
  profileCompleted: boolean
  createdAt: number
  lastLoginAt: number | null
  gamesPlayed: number
  wins: number
  totalPoints: number
  rating: number
}

type ProfileGameEntry = {
  id: number
  pin: string
  theme: string
  format: 'teams' | 'ffa'
  finishedAt: number
  winner: string
  scoreA: number
  scoreB: number
  team: TeamId
  points: number
  correct: number
  wrong: number
  timeouts: number
  skips: number
  accuracy: number
}

type ProfileAchievement = {
  key: string
  title: string
  description: string
  unlocked: boolean
  progress: number
  target: number
}

type PublicProfilePayload = {
  profile: UserProfile
  games: ProfileGameEntry[]
  social: {
    friendsCount: number
  }
  achievements: ProfileAchievement[]
  friendshipStatus: FriendshipStatus
}

type FriendUser = UserProfile & {
  requestId?: number
  createdAt?: number
  since?: number
  friendshipStatus: FriendshipStatus
}

type FriendOverview = {
  me: UserProfile
  friends: FriendUser[]
  incoming: FriendUser[]
  outgoing: FriendUser[]
}

type GameInviteIncoming = {
  id: number
  pin: string
  theme: string
  message: string
  status: string
  createdAt: number
  updatedAt: number
  from: {
    username: string
    displayName: string
    avatarUrl: string
    firstName: string
    lastName: string
  }
}

type GameInviteOutgoing = {
  id: number
  pin: string
  theme: string
  message: string
  status: string
  createdAt: number
  updatedAt: number
  to: {
    username: string
    displayName: string
    avatarUrl: string
    firstName: string
    lastName: string
  }
}

type GameInvitesPayload = {
  incoming: GameInviteIncoming[]
  outgoing: GameInviteOutgoing[]
}

type RoomDirectoryItem = {
  pin: string
  theme: string
  status: 'lobby' | 'running' | 'paused' | 'finished' | string
  format: GameFormat
  formatLabel: string
  gameMode: GameplayModeId | string
  gameModeLabel: string
  hostName: string
  hasPassword: boolean
  playersCount: number
  participantsCount: number
  teams: {
    A: number
    B: number
  }
  questionCount: number
  timerSeconds: number
  selectedModes: string[]
  audience: string
  tone: string
  createdAt: number
}

type GameDetails = {
  game: {
    id: number
    pin: string
    theme: string
    format: 'teams' | 'ffa'
    status: string
    createdAt: number
    finishedAt: number
    winner: string
    scoreA: number
    scoreB: number
    exportFile: string
  }
  players: Array<{
    username: string
    displayName?: string
    avatarUrl?: string
    firstName?: string
    lastName?: string
    team: string
    points: number
    correct: number
    wrong: number
    timeouts: number
    skips: number
    accuracy: number
  }>
  summary: {
    roundHistory?: Array<{
      question?: string
      options?: string[]
      correctOption?: string
      explanation?: string
      submission?: Submission
    }>
  } | null
}

type ChatThreadItem = {
  threadId: number
  updatedAt: number
  unreadCount: number
  peer: UserProfile
  lastMessage: {
    id: number
    text: string
    createdAt: number
    fromMe: boolean
  } | null
}

type ChatMessageItem = {
  id: number
  text: string
  createdAt: number
  readAt: number | null
  fromUserId: number
  toUserId: number
  fromMe: boolean
}

const achievementVisuals: Record<string, { icon: string; color: string }> = {
  starter: { icon: '🚀', color: '#17b15b' },
  winner: { icon: '🏆', color: '#f4a720' },
  strategist: { icon: '🧠', color: '#1f9de1' },
  accuracy_80: { icon: '🎯', color: '#6b68ff' },
  socializer: { icon: '🤝', color: '#12b6a8' },
  veteran: { icon: '🛡️', color: '#0f8f7d' },
}

const modeCatalog = [
  {
    id: 'capitals',
    label: 'Столицы',
    emoji: '🏛',
    category: 'География',
    description: 'Вопросы про страны, столицы и географические ориентиры.',
    effect: 'Делает раунды более фактологичными и доступными широкой аудитории.',
  },
  {
    id: 'flags',
    label: 'Флаги',
    emoji: '🚩',
    category: 'География',
    description: 'Фокус на государственных символах, флагах и визуальных ассоциациях.',
    effect: 'Добавляет визуальную память и быстрые ответы на узнавание.',
  },
  {
    id: 'equations',
    label: 'Равенства',
    emoji: '🧮',
    category: 'Математика',
    description: 'Логические и числовые задачи, вычисления и проверка внимательности.',
    effect: 'Поднимает сложность и вовлекает участников с аналитическим стилем.',
  },
  {
    id: 'dice',
    label: 'Игральные кости',
    emoji: '🎲',
    category: 'Математика',
    description: 'Вероятности, комбинации и задачи на случайные события.',
    effect: 'Делает игру более вариативной и “настольной” по ощущению.',
  },
  {
    id: 'colors',
    label: 'Цвета',
    emoji: '🎨',
    category: 'Восприятие',
    description: 'Вопросы на визуальные различия, палитры и цветовые связи.',
    effect: 'Добавляет лёгкие, быстрые и зрелищные раунды.',
  },
  {
    id: 'timer',
    label: 'Обратный отсчет',
    emoji: '⏳',
    category: 'Восприятие',
    description: 'Больше заданий на реакцию и короткое принятие решения.',
    effect: 'Усиливает темп матча и стресс-тест на скорость команды.',
  },
  {
    id: 'blitz',
    label: 'Блиц-раунд',
    emoji: '⚡',
    category: 'Динамика',
    description: 'Уменьшает время ответа в каждом раунде.',
    effect: 'Механика: таймер игры становится заметно короче.',
  },
  {
    id: 'expert',
    label: 'Экспертный раунд',
    emoji: '🎓',
    category: 'Динамика',
    description: 'Сложные вопросы оцениваются выше при правильном ответе.',
    effect: 'Механика: дополнительный бонус за сложные правильные ответы.',
  },
]

const audienceCatalog: Array<{ value: AudienceMode; label: string }> = [
  { value: 'universal', label: 'Для всех' },
  { value: 'students', label: 'Школьники и студенты' },
  { value: 'hackathons', label: 'Хакатоны и мероприятия' },
  { value: 'teachers', label: 'Учебный класс' },
  { value: 'corporate', label: 'Тимбилдинг компании' },
]

const toneCatalog: Array<{ value: ToneMode; label: string }> = [
  { value: 'balanced', label: 'Сбалансированный' },
  { value: 'fun', label: 'Фан и динамика' },
  { value: 'challenge', label: 'Сложный соревновательный' },
]

const gameplayModeCatalog: Array<{
  id: GameplayModeId
  title: string
  tagline: string
  icon: string
  format: GameFormat
  forceSpeedBonus: boolean
  passEnabled: boolean
  rules: string[]
}> = [
  {
    id: 'team_battle',
    title: 'Командная дуэль',
    tagline: 'Классика 2 на 2+ с голосованием команды',
    icon: '🛡',
    format: 'teams',
    forceSpeedBonus: false,
    passEnabled: true,
    rules: [
      'Формат Команда A против Команды B.',
      'Ответ фиксируется по большинству голосов в команде.',
      'Пас доступен, штрафов за пас нет.',
      'Лучший режим для турнира и защиты стратегии.',
    ],
  },
  {
    id: 'duel_1v1',
    title: 'Дуэль 1 на 1',
    tagline: 'Только два игрока: один против одного',
    icon: '⚔️',
    format: 'teams',
    forceSpeedBonus: false,
    passEnabled: true,
    rules: [
      'В матче только 2 игрока: Команда A и Команда B.',
      'Каждый отвечает за свою команду лично, без голосования.',
      'В комнату нельзя подключить третьего игрока.',
      'Идеально для личных баттлов и челленджей.',
    ],
  },
  {
    id: 'solo_arena',
    title: 'Соло-арена',
    tagline: 'Каждый играет сам за себя',
    icon: '🎯',
    format: 'ffa',
    forceSpeedBonus: false,
    passEnabled: true,
    rules: [
      'Формат каждый сам за себя (FFA).',
      'Каждый участник отвечает на свой раунд лично.',
      'Побеждает игрок с максимальным количеством очков.',
      'Идеально для быстрых личных рейтингов.',
    ],
  },
  {
    id: 'turbo_storm',
    title: 'Турбо-шторм',
    tagline: 'Жесткий таймер и повышенные очки',
    icon: '⚡',
    format: 'teams',
    forceSpeedBonus: true,
    passEnabled: false,
    rules: [
      'Командный матч с таймером -35% к базовому.',
      'Пас отключен, только жесткий выбор ответа.',
      'За верный ответ дается +1 дополнительное очко.',
      'Скоростной режим для зрелищных финалов.',
    ],
  },
  {
    id: 'combo_rush',
    title: 'Комбо-гонка',
    tagline: 'FFA с сериями правильных ответов',
    icon: '🔥',
    format: 'ffa',
    forceSpeedBonus: true,
    passEnabled: true,
    rules: [
      'Формат FFA, усиленный комбо-механикой.',
      'За серию правильных ответов растет бонус до +3.',
      'Ошибка, таймаут или пас сбрасывают комбо.',
      'Режим для камбэков и персонального мастерства.',
    ],
  },
]

const themeSuggestions = [
  'История России',
  'Искусственный интеллект',
  'Киберпанк в кино',
  'История технологий',
  'Космос',
  'География мира',
  'Биология',
  'Мировая литература',
]

const getReviewPresentation = (submission: Submission | null | undefined) => {
  if (!submission) {
    return {
      toneClass: 'round-review-neutral',
      icon: 'ℹ️',
      label: 'Пояснение',
    }
  }

  if (submission.type === 'timeout') {
    return {
      toneClass: 'round-review-timeout',
      icon: '⏱',
      label: 'Время вышло',
    }
  }

  if (submission.type === 'skip') {
    return {
      toneClass: 'round-review-skip',
      icon: '⏭',
      label: 'Пропуск',
    }
  }

  if (submission.type === 'pass') {
    return {
      toneClass: 'round-review-skip',
      icon: '⏸',
      label: 'Пас',
    }
  }

  if (submission.correct) {
    return {
      toneClass: 'round-review-correct',
      icon: '✅',
      label: 'Верный ответ',
    }
  }

  return {
    toneClass: 'round-review-wrong',
    icon: '❌',
    label: 'Ошибка',
  }
}

const formatMs = (ms: number) => {
  const safe = Math.max(0, ms)
  const totalSeconds = Math.ceil(safe / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const getInitials = (name: string) => {
  const parts = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)

  if (!parts.length) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

const formatRoster = (names: string[], max = 5) => {
  if (names.length === 0) return '—'
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} +${names.length - max}`
}

const trimLine = (value: string, max = 110) => {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

const formatRoundOutcome = (submission: Submission, format: GameFormat) => {
  if (submission.type === 'timeout') {
    return format === 'ffa'
      ? 'Время вышло: игрок не отправил ответ.'
      : 'Время вышло: команда не отправила ответ.'
  }
  if (submission.type === 'skip') {
    return 'Раунд пропущен ведущим.'
  }
  if (submission.type === 'pass') {
    return `${submission.byName} выбрал(а) пас.`
  }
  if (submission.correct) {
    return `${submission.byName} дал(а) верный ответ (+${submission.points}).`
  }
  return `${submission.byName} ответил(а) неверно.`
}

const escapeXml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const buildCertificateSvg = (payload: {
  title: string
  subtitle: string
  theme: string
  winner: string
  score: string
  roundsLine: string
  modes: string
  participantsLine: string
  bestPlayerLine: string
  dateLabel: string
  pin: string
}) => {
  const title = escapeXml(payload.title)
  const subtitle = escapeXml(payload.subtitle)
  const theme = escapeXml(payload.theme)
  const winner = escapeXml(payload.winner)
  const score = escapeXml(payload.score)
  const roundsLine = escapeXml(payload.roundsLine)
  const modes = escapeXml(payload.modes)
  const participantsLine = escapeXml(payload.participantsLine)
  const bestPlayerLine = escapeXml(payload.bestPlayerLine)
  const dateLabel = escapeXml(payload.dateLabel)
  const pin = escapeXml(payload.pin)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d8f45"/>
      <stop offset="45%" stop-color="#15c874"/>
      <stop offset="80%" stop-color="#11b8c8"/>
      <stop offset="100%" stop-color="#1da2e5"/>
    </linearGradient>
    <linearGradient id="card" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#f0fff8" stop-opacity="0.92"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="20" stdDeviation="26" flood-color="#033f33" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <circle cx="1450" cy="130" r="240" fill="#9dfff2" fill-opacity="0.14"/>
  <circle cx="190" cy="760" r="220" fill="#d5fff2" fill-opacity="0.14"/>
  <rect x="110" y="90" width="1380" height="720" rx="44" fill="url(#card)" filter="url(#shadow)"/>
  <rect x="142" y="122" width="1316" height="656" rx="30" fill="none" stroke="#19b15c" stroke-opacity="0.35" stroke-width="2"/>
  <text x="800" y="205" text-anchor="middle" fill="#0f2b26" font-size="48" font-family="Golos Text, Inter, Arial, sans-serif" font-weight="800">${title}</text>
  <text x="800" y="252" text-anchor="middle" fill="#266158" font-size="30" font-family="Golos Text, Inter, Arial, sans-serif" font-weight="600">${subtitle}</text>
  <text x="800" y="340" text-anchor="middle" fill="#0f2b26" font-size="42" font-family="Golos Text, Inter, Arial, sans-serif" font-weight="700">${winner}</text>
  <text x="800" y="390" text-anchor="middle" fill="#25524b" font-size="28" font-family="Golos Text, Inter, Arial, sans-serif">Тема игры: ${theme}</text>
  <text x="800" y="430" text-anchor="middle" fill="#25524b" font-size="28" font-family="Golos Text, Inter, Arial, sans-serif">${score}</text>
  <text x="800" y="472" text-anchor="middle" fill="#25524b" font-size="24" font-family="Golos Text, Inter, Arial, sans-serif">${roundsLine}</text>
  <text x="800" y="510" text-anchor="middle" fill="#25524b" font-size="24" font-family="Golos Text, Inter, Arial, sans-serif">Режимы: ${modes}</text>
  <text x="800" y="548" text-anchor="middle" fill="#25524b" font-size="22" font-family="Golos Text, Inter, Arial, sans-serif">${participantsLine}</text>
  <text x="800" y="584" text-anchor="middle" fill="#25524b" font-size="22" font-family="Golos Text, Inter, Arial, sans-serif">${bestPlayerLine}</text>
  <g>
    <rect x="220" y="640" width="500" height="124" rx="20" fill="#ffffff" fill-opacity="0.78"/>
    <text x="470" y="692" text-anchor="middle" fill="#1f4e46" font-size="25" font-family="Golos Text, Inter, Arial, sans-serif" font-weight="700">Дата матча</text>
    <text x="470" y="734" text-anchor="middle" fill="#1f4e46" font-size="28" font-family="Golos Text, Inter, Arial, sans-serif" font-weight="800">${dateLabel}</text>
  </g>
  <g>
    <rect x="880" y="640" width="500" height="124" rx="20" fill="#ffffff" fill-opacity="0.78"/>
    <text x="1130" y="692" text-anchor="middle" fill="#1f4e46" font-size="25" font-family="Golos Text, Inter, Arial, sans-serif" font-weight="700">PIN комнаты</text>
    <text x="1130" y="734" text-anchor="middle" fill="#1f4e46" font-size="34" letter-spacing="6" font-family="Golos Text, Inter, Arial, sans-serif" font-weight="800">${pin}</text>
  </g>
  <text x="800" y="760" text-anchor="middle" fill="#2a6158" font-size="22" font-family="Golos Text, Inter, Arial, sans-serif">QuizBattle • Sber Hack Edition</text>
</svg>`
}

const formatDateTime = (timestamp: number | null | undefined) => {
  if (!timestamp) return '—'
  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) return '—'
  return value.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const friendshipStatusLabel: Record<FriendshipStatus, string> = {
  self: 'Это вы',
  none: 'Не в друзьях',
  accepted: 'В друзьях',
  pending_outgoing: 'Заявка отправлена',
  pending_incoming: 'Ждет вашего решения',
}

const readStoredSession = (): StoredSession | null => {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed?.role || !parsed?.pin) return null
    return parsed
  } catch {
    return null
  }
}

const writeStoredSession = (session: StoredSession) => {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

const clearStoredSession = () => {
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}

const readStoredAuthToken = () => {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

const writeStoredAuthToken = (token: string) => {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
}

const clearStoredAuthToken = () => {
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}

const readStoredPlayerKeyForPin = (pin: string) => {
  const stored = readStoredSession()
  const normalizedPin = pin.trim().toUpperCase()
  if (!stored || stored.role !== 'player') return ''
  if (stored.pin.trim().toUpperCase() !== normalizedPin) return ''
  return stored.playerKey || ''
}

const App = () => {
  const socketRef = useRef<Socket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const lastRoundSignalRef = useRef<string>('')
  const lastSubmissionSignalRef = useRef<string>('')
  const lastCountdownRef = useRef<number>(-1)
  const reconnectAttemptSocketRef = useRef<string | null>(null)

  const [connected, setConnected] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [mode, setMode] = useState<LobbyMode>('host')
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = window.localStorage.getItem('quizbattle:theme')
    return stored === 'dark' ? 'dark' : 'light'
  })
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('quizbattle:sound') !== 'off'
  })

  const [hostName, setHostName] = useState('Ведущий')
  const [theme, setTheme] = useState('Страны и флаги')
  const [questionCount, setQuestionCount] = useState(5)
  const [timerSeconds, setTimerSeconds] = useState(30)
  const [audience, setAudience] = useState<AudienceMode>('universal')
  const [tone, setTone] = useState<ToneMode>('balanced')
  const [gameMode, setGameMode] = useState<GameplayModeId>('team_battle')
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>('mixed')
  const [speedBonusEnabled, setSpeedBonusEnabled] = useState(false)
  const [roomPassword, setRoomPassword] = useState('')
  const [selectedModes, setSelectedModes] = useState<string[]>(['capitals', 'flags', 'equations'])
  const [modeInfoOpen, setModeInfoOpen] = useState<GameplayModeId | null>(null)
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false)

  const [joinName, setJoinName] = useState('Игрок')
  const [joinPin, setJoinPin] = useState(() => {
    const pin = new URLSearchParams(window.location.search).get('pin')
    return pin || ''
  })
  const [joinRoomPassword, setJoinRoomPassword] = useState('')
  const [roomsQuery, setRoomsQuery] = useState('')
  const [roomsDirectory, setRoomsDirectory] = useState<RoomDirectoryItem[]>([])
  const [roomsDirectoryBusy, setRoomsDirectoryBusy] = useState(false)
  const [roomsDirectoryUpdatedAt, setRoomsDirectoryUpdatedAt] = useState(0)

  const [landingPage, setLandingPage] = useState<LandingPage>(() => {
    if (typeof window === 'undefined') return 'play'
    const saved = window.localStorage.getItem(LANDING_PAGE_STORAGE_KEY)
    if (
      saved === 'play' ||
      saved === 'rooms' ||
      saved === 'account' ||
      saved === 'community' ||
      saved === 'leaderboard' ||
      saved === 'history'
    ) {
      return saved
    }
    return 'play'
  })

  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authToken, setAuthToken] = useState(() => (typeof window === 'undefined' ? '' : readStoredAuthToken()))
  const [authProfile, setAuthProfile] = useState<UserProfile | null>(null)
  const [profileGames, setProfileGames] = useState<ProfileGameEntry[]>([])
  const [profileAchievements, setProfileAchievements] = useState<ProfileAchievement[]>([])
  const [profileFriendsCount, setProfileFriendsCount] = useState(0)
  const [profileFirstName, setProfileFirstName] = useState('')
  const [profileLastName, setProfileLastName] = useState('')
  const [profileNickname, setProfileNickname] = useState('')
  const [profileAge, setProfileAge] = useState('')
  const [profileActivity, setProfileActivity] = useState('')
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('')
  const [profileBio, setProfileBio] = useState('')
  const [registerMode, setRegisterMode] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([])
  const [recentGames, setRecentGames] = useState<HistoryItem[]>([])
  const [selectedHistoryGame, setSelectedHistoryGame] = useState<GameDetails | null>(null)
  const [historyBusy, setHistoryBusy] = useState(false)

  const [friendOverview, setFriendOverview] = useState<FriendOverview | null>(null)
  const [friendInvites, setFriendInvites] = useState<GameInvitesPayload>({ incoming: [], outgoing: [] })
  const [friendSearchQuery, setFriendSearchQuery] = useState('')
  const [friendSearchBusy, setFriendSearchBusy] = useState(false)
  const [friendSearchResults, setFriendSearchResults] = useState<FriendUser[]>([])
  const [friendInvitePin, setFriendInvitePin] = useState('')
  const [friendInviteTheme, setFriendInviteTheme] = useState('')
  const [friendInviteMessage, setFriendInviteMessage] = useState('')
  const [publicProfileCard, setPublicProfileCard] = useState<PublicProfilePayload | null>(null)
  const [publicProfileBusy, setPublicProfileBusy] = useState(false)
  const [chatThreads, setChatThreads] = useState<ChatThreadItem[]>([])
  const [activeChatPeer, setActiveChatPeer] = useState<UserProfile | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [chatSearchFilter, setChatSearchFilter] = useState('')
  const [publicProfileModalOpen, setPublicProfileModalOpen] = useState(false)

  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [localClockMs, setLocalClockMs] = useState(0)
  const [finalHistoryIndex, setFinalHistoryIndex] = useState(0)

  useEffect(() => {
    const stored = readStoredSession()
    if (!stored || stored.role !== 'player') return
    if (stored.pin.trim().toUpperCase() !== joinPin.trim().toUpperCase()) return
    setJoinRoomPassword(stored.roomPassword || '')
  }, [joinPin])

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
    })
    socket.on('disconnect', () => {
      setConnected(false)
      setRoomState(null)
    })

    socket.on('room:state', (payload: RoomState) => {
      setRoomState(payload)
    })

    socket.on('room:closed', (payload: { reason?: string }) => {
      setRoomState(null)
      clearStoredSession()
      setNotice(payload?.reason || 'Комната завершена.')
    })

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLocalClockMs(Date.now())
    }, 250)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!notice) return undefined

    const timer = window.setTimeout(() => setNotice(null), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    document.documentElement.setAttribute('data-ui-theme', uiTheme)
    window.localStorage.setItem('quizbattle:theme', uiTheme)
  }, [uiTheme])

  useEffect(() => {
    window.localStorage.setItem('quizbattle:sound', soundEnabled ? 'on' : 'off')
  }, [soundEnabled])

  useEffect(() => {
    if (authToken) {
      writeStoredAuthToken(authToken)
    } else {
      clearStoredAuthToken()
    }
  }, [authToken])

  type SignalStep = {
    frequency: number
    duration: number
    gain: number
    delay?: number
  }

  const resumeAudioContext = useCallback(async () => {
    const Scope = window as typeof window & { webkitAudioContext?: typeof AudioContext }
    const Ctx = Scope.AudioContext || Scope.webkitAudioContext
    if (!Ctx) return null

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new Ctx()
    }

    const ctx = audioContextRef.current
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        return null
      }
    }

    return ctx
  }, [])

  const playSignal = useCallback(async (tone: 'round' | 'ok' | 'fail' | 'warn') => {
    if (!soundEnabled) return

    try {
      const ctx = await resumeAudioContext()
      if (!ctx || ctx.state !== 'running') return
      const presets: Record<'round' | 'ok' | 'fail' | 'warn', SignalStep[]> = {
        round: [
          { frequency: 560, duration: 0.08, gain: 0.05 },
          { frequency: 740, duration: 0.07, gain: 0.045, delay: 0.08 },
        ],
        ok: [
          { frequency: 620, duration: 0.07, gain: 0.06 },
          { frequency: 860, duration: 0.09, gain: 0.055, delay: 0.08 },
        ],
        fail: [
          { frequency: 340, duration: 0.1, gain: 0.06 },
          { frequency: 240, duration: 0.12, gain: 0.055, delay: 0.08 },
        ],
        warn: [{ frequency: 420, duration: 0.06, gain: 0.045 }],
      }

      const sequence = presets[tone]
      sequence.forEach((step) => {
        const oscillator = ctx.createOscillator()
        const gainNode = ctx.createGain()
        const startAt = ctx.currentTime + (step.delay ?? 0)
        oscillator.type = tone === 'fail' ? 'triangle' : 'sine'
        oscillator.frequency.value = step.frequency
        gainNode.gain.setValueAtTime(0.0001, startAt)
        gainNode.gain.exponentialRampToValueAtTime(step.gain, startAt + 0.01)
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + step.duration)
        oscillator.connect(gainNode)
        gainNode.connect(ctx.destination)
        oscillator.start(startAt)
        oscillator.stop(startAt + step.duration + 0.02)
      })
    } catch {
      return
    }
  }, [resumeAudioContext, soundEnabled])

  useEffect(() => {
    const wakeAudio = () => {
      void resumeAudioContext()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void resumeAudioContext()
      }
    }

    window.addEventListener('pointerdown', wakeAudio, { passive: true })
    window.addEventListener('keydown', wakeAudio)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pointerdown', wakeAudio)
      window.removeEventListener('keydown', wakeAudio)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [resumeAudioContext])

  const emitWithAck = useCallback(
    <T,>(eventName: string, payload: unknown) =>
      new Promise<T>((resolve, reject) => {
        const socket = socketRef.current
        if (!socket) {
          reject(new Error('Socket is not connected'))
          return
        }

        socket.emit(eventName, payload, (response: { ok: boolean; error?: string } & T) => {
          if (!response?.ok) {
            reject(new Error(response?.error || 'Unknown socket error'))
            return
          }
          resolve(response)
        })
      }),
    [],
  )

  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !connected) return
    if (roomState) return
    if (!socket.id) return
    if (reconnectAttemptSocketRef.current === socket.id) return

    reconnectAttemptSocketRef.current = socket.id
    const stored = readStoredSession()
    if (!stored) return

    const restore = async () => {
      try {
        if (stored.role === 'host') {
          if (!stored.hostKey) throw new Error('Нет ключа ведущего для переподключения.')
          await emitWithAck('host:rejoinRoom', {
            pin: stored.pin,
            hostKey: stored.hostKey,
          })
          setNotice('Ведущий переподключен к комнате.')
          return
        }

        const restored = await emitWithAck<{ pin: string; playerKey: string }>('player:joinRoom', {
          pin: stored.pin,
          name: stored.name || 'Игрок',
          playerKey: stored.playerKey,
          roomPassword: stored.roomPassword,
        })
        writeStoredSession({
          ...stored,
          pin: restored.pin,
          playerKey: restored.playerKey,
        })
        setNotice('Подключение к комнате восстановлено.')
      } catch (error) {
        clearStoredSession()
        setNotice(error instanceof Error ? error.message : 'Не удалось восстановить подключение к комнате.')
      }
    }

    void restore()
  }, [connected, emitWithAck, roomState])

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = authToken.trim()
      const headers = new Headers(options.headers || {})
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return fetch(url, {
        ...options,
        headers,
      })
    },
    [authToken],
  )

  const fetchLeaderboardData = useCallback(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/leaderboard?limit=50`)
      const payload = (await response.json()) as { ok?: boolean; items?: LeaderboardItem[] }
      if (!response.ok || !payload?.ok) return
      setLeaderboard(Array.isArray(payload.items) ? payload.items : [])
    } catch {
      return
    }
  }, [])

  const fetchHistoryData = useCallback(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/history?limit=30`)
      const payload = (await response.json()) as { ok?: boolean; items?: HistoryItem[] }
      if (!response.ok || !payload?.ok) return
      setRecentGames(Array.isArray(payload.items) ? payload.items : [])
    } catch {
      return
    }
  }, [])

  const fetchRoomsDirectory = useCallback(
    async (silent = false) => {
      if (!silent) {
        setRoomsDirectoryBusy(true)
      }
      try {
        const params = new URLSearchParams()
        params.set('status', 'lobby')
        params.set('limit', '60')
        const normalizedQuery = roomsQuery.trim()
        if (normalizedQuery) {
          params.set('q', normalizedQuery)
        }

        const response = await fetch(`${SERVER_URL}/api/rooms?${params.toString()}`)
        const payload = (await response.json()) as {
          ok?: boolean
          error?: string
          items?: RoomDirectoryItem[]
        }
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || 'Не удалось загрузить список комнат.')
        }
        setRoomsDirectory(Array.isArray(payload.items) ? payload.items : [])
        setRoomsDirectoryUpdatedAt(Date.now())
      } catch (error) {
        if (!silent) {
          setNotice(error instanceof Error ? error.message : 'Не удалось загрузить список комнат.')
        }
      } finally {
        if (!silent) {
          setRoomsDirectoryBusy(false)
        }
      }
    },
    [roomsQuery],
  )

  const applyProfileToForm = useCallback((profile: UserProfile | null) => {
    if (!profile) return
    setProfileFirstName(profile.firstName || '')
    setProfileLastName(profile.lastName || '')
    setProfileNickname(profile.nickname || '')
    setProfileAge(profile.age ? String(profile.age) : '')
    setProfileActivity(profile.activity || '')
    setProfileAvatarUrl(profile.avatarUrl || '')
    setProfileBio(profile.bio || '')
  }, [])

  const fetchProfileData = useCallback(
    async (username: string) => {
      const safeUsername = username.trim()
      if (!safeUsername) return

      const response = await authFetch(`${SERVER_URL}/api/profile/${encodeURIComponent(safeUsername)}?limit=25`)
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        profile?: UserProfile
        games?: ProfileGameEntry[]
        achievements?: ProfileAchievement[]
        social?: { friendsCount?: number }
      }
      if (!response.ok || !payload?.ok || !payload.profile) {
        throw new Error(payload?.error || 'Не удалось загрузить профиль.')
      }

      setAuthProfile(payload.profile)
      setProfileGames(Array.isArray(payload.games) ? payload.games : [])
      setProfileAchievements(Array.isArray(payload.achievements) ? payload.achievements : [])
      setProfileFriendsCount(Number(payload.social?.friendsCount || 0))
      applyProfileToForm(payload.profile)
    },
    [applyProfileToForm, authFetch],
  )

  const fetchMyProfile = useCallback(async () => {
    if (!authToken) return
    const meResponse = await authFetch(`${SERVER_URL}/api/auth/me`)
    const mePayload = (await meResponse.json()) as { ok?: boolean; error?: string; profile?: UserProfile }
    if (!meResponse.ok || !mePayload?.ok || !mePayload.profile) {
      throw new Error(mePayload?.error || 'Не удалось обновить сессию.')
    }
    await fetchProfileData(mePayload.profile.username)
  }, [authFetch, authToken, fetchProfileData])

  const fetchFriendsData = useCallback(async () => {
    if (!authToken) return
    const [friendsResponse, invitesResponse] = await Promise.all([
      authFetch(`${SERVER_URL}/api/friends`),
      authFetch(`${SERVER_URL}/api/friends/invites?limit=30`),
    ])

    const friendsPayload = (await friendsResponse.json()) as {
      ok?: boolean
      error?: string
      me?: UserProfile
      friends?: FriendUser[]
      incoming?: FriendUser[]
      outgoing?: FriendUser[]
    }
    if (!friendsResponse.ok || !friendsPayload?.ok || !friendsPayload.me) {
      throw new Error(friendsPayload?.error || 'Не удалось загрузить друзей.')
    }

    const invitesPayload = (await invitesResponse.json()) as {
      ok?: boolean
      error?: string
      incoming?: GameInviteIncoming[]
      outgoing?: GameInviteOutgoing[]
    }
    if (!invitesResponse.ok || !invitesPayload?.ok) {
      throw new Error(invitesPayload?.error || 'Не удалось загрузить приглашения.')
    }

    setFriendOverview({
      me: friendsPayload.me,
      friends: Array.isArray(friendsPayload.friends) ? friendsPayload.friends : [],
      incoming: Array.isArray(friendsPayload.incoming) ? friendsPayload.incoming : [],
      outgoing: Array.isArray(friendsPayload.outgoing) ? friendsPayload.outgoing : [],
    })
    setFriendInvites({
      incoming: Array.isArray(invitesPayload.incoming) ? invitesPayload.incoming : [],
      outgoing: Array.isArray(invitesPayload.outgoing) ? invitesPayload.outgoing : [],
    })
  }, [authFetch, authToken])

  const fetchChatsData = useCallback(
    async (silent = false) => {
      if (!authToken) return
      const normalizedActiveUsername = activeChatPeer?.username.toLowerCase() || ''
      if (!silent) {
        setChatLoading(true)
      }
      try {
        const response = await authFetch(`${SERVER_URL}/api/chats?limit=40`)
        const payload = (await response.json()) as { ok?: boolean; error?: string; items?: ChatThreadItem[] }
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || 'Не удалось загрузить чаты.')
        }
        const items = Array.isArray(payload.items) ? payload.items : []
        setChatThreads(items)
        if (normalizedActiveUsername) {
          const peerRow = items.find((item) => item.peer.username.toLowerCase() === normalizedActiveUsername)
          if (peerRow?.peer) {
            setActiveChatPeer(peerRow.peer)
          }
        }
      } catch (error) {
        if (!silent) {
          setNotice(error instanceof Error ? error.message : 'Ошибка загрузки чатов.')
        }
      } finally {
        if (!silent) {
          setChatLoading(false)
        }
      }
    },
    [activeChatPeer?.username, authFetch, authToken],
  )

  const loadChatMessages = useCallback(
    async (username: string, silent = false) => {
      if (!authToken) return
      const safeUsername = username.trim()
      if (!safeUsername) return
      if (!silent) {
        setChatLoading(true)
      }
      try {
        const response = await authFetch(`${SERVER_URL}/api/chats/${encodeURIComponent(safeUsername)}/messages?limit=120`)
        const payload = (await response.json()) as {
          ok?: boolean
          error?: string
          peer?: UserProfile
          messages?: ChatMessageItem[]
        }
        if (!response.ok || !payload?.ok || !payload.peer) {
          throw new Error(payload?.error || 'Не удалось загрузить сообщения.')
        }
        setActiveChatPeer(payload.peer)
        setChatMessages(Array.isArray(payload.messages) ? payload.messages : [])
        setChatThreads((current) =>
          current.map((item) =>
            item.peer.username.toLowerCase() === payload.peer?.username.toLowerCase()
              ? { ...item, unreadCount: 0, peer: payload.peer || item.peer }
              : item,
          ),
        )
      } catch (error) {
        if (!silent) {
          setNotice(error instanceof Error ? error.message : 'Ошибка загрузки диалога.')
        }
      } finally {
        if (!silent) {
          setChatLoading(false)
        }
      }
    },
    [authFetch, authToken],
  )

  const openChatWithUser = useCallback(
    async (username: string) => {
      const safeUsername = username.trim()
      if (!safeUsername) return
      if (!authToken) {
        setNotice('Сначала войдите в аккаунт.')
        setLandingPage('account')
        return
      }
      setLandingPage('community')
      setPublicProfileModalOpen(false)
      await loadChatMessages(safeUsername)
      await fetchChatsData(true)
    },
    [authToken, fetchChatsData, loadChatMessages],
  )

  useEffect(() => {
    void fetchLeaderboardData()
    void fetchHistoryData()
  }, [fetchLeaderboardData, fetchHistoryData])

  useEffect(() => {
    if (landingPage !== 'rooms') return
    if (roomState) return

    void fetchRoomsDirectory()
    const timer = window.setInterval(() => {
      void fetchRoomsDirectory(true)
    }, 12000)

    return () => window.clearInterval(timer)
  }, [fetchRoomsDirectory, landingPage, roomState])

  useEffect(() => {
    if (!authToken) return
    void fetchMyProfile().catch((error) => {
      clearStoredAuthToken()
      setAuthToken('')
      setAuthProfile(null)
      setNotice(error instanceof Error ? error.message : 'Сессия истекла.')
    })
  }, [authToken, fetchMyProfile])

  useEffect(() => {
    if (!authToken) {
      setFriendOverview(null)
      setFriendInvites({ incoming: [], outgoing: [] })
      setFriendSearchResults([])
      setChatThreads([])
      setChatMessages([])
      setChatDraft('')
      setChatSearchFilter('')
      setActiveChatPeer(null)
      setPublicProfileCard(null)
      setPublicProfileModalOpen(false)
      return
    }
    void fetchFriendsData().catch((error) => {
      setNotice(error instanceof Error ? error.message : 'Не удалось загрузить друзей.')
    })
    void fetchChatsData(true)
  }, [authToken, fetchChatsData, fetchFriendsData])

  useEffect(() => {
    if (!authToken) return
    const timer = window.setInterval(() => {
      void fetchChatsData(true)
    }, 9000)
    return () => window.clearInterval(timer)
  }, [authToken, fetchChatsData])

  useEffect(() => {
    if (!authToken || !activeChatPeer) return
    const timer = window.setInterval(() => {
      void loadChatMessages(activeChatPeer.username, true)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [activeChatPeer, authToken, loadChatMessages])

  useEffect(() => {
    window.localStorage.setItem(LANDING_PAGE_STORAGE_KEY, landingPage)
  }, [landingPage])

  const selectedModeTitles = useMemo(
    () => modeCatalog.filter((item) => selectedModes.includes(item.id)).map((item) => item.label),
    [selectedModes],
  )

  const normalizedTheme = useMemo(() => theme.trim() || 'Общая эрудиция', [theme])

  const selectedAudienceLabel = useMemo(
    () => audienceCatalog.find((item) => item.value === audience)?.label || 'Для всех',
    [audience],
  )

  const selectedToneLabel = useMemo(
    () => toneCatalog.find((item) => item.value === tone)?.label || 'Сбалансированный',
    [tone],
  )

  const roomsDirectoryUpdatedLabel = useMemo(() => {
    if (!roomsDirectoryUpdatedAt) return 'Список еще не обновлялся'
    return `Обновлено: ${new Date(roomsDirectoryUpdatedAt).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
  }, [roomsDirectoryUpdatedAt])

  const selectedGameplayMode = useMemo(
    () => gameplayModeCatalog.find((item) => item.id === gameMode) || gameplayModeCatalog[0],
    [gameMode],
  )
  const gameFormat = selectedGameplayMode.format
  const speedBonusLockedByMode = selectedGameplayMode.forceSpeedBonus

  useEffect(() => {
    if (selectedGameplayMode.forceSpeedBonus) {
      setSpeedBonusEnabled(true)
    }
  }, [selectedGameplayMode.forceSpeedBonus])

  const createRoomRequest = async () => {
    const payload = await emitWithAck<{ pin: string; hostKey: string }>('host:createRoom', {
      hostName,
      theme: normalizedTheme,
      questionCount,
      timerSeconds,
      audience,
      tone,
      gameMode,
      format: gameFormat,
      difficultyMode,
      speedBonusEnabled,
      roomPassword: roomPassword.trim(),
      selectedModes,
    })

    writeStoredSession({
      role: 'host',
      pin: payload.pin,
      name: hostName,
      hostKey: payload.hostKey,
      roomPassword: roomPassword.trim(),
    })
    setJoinPin(payload.pin)
    setFriendInvitePin(payload.pin)
    setMode('host')
  }

  const createRoom = async (event: FormEvent) => {
    event.preventDefault()

    try {
      await createRoomRequest()
      setNotice('Комната создана. Делись PIN с игроками.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось создать комнату.')
    }
  }

  const joinRoomRequest = async (options?: { pin?: string; roomPassword?: string }) => {
    const normalizedPin = String(options?.pin ?? joinPin)
      .trim()
      .toUpperCase()
    const playerKey = readStoredPlayerKeyForPin(normalizedPin)
    const normalizedRoomPassword = String(options?.roomPassword ?? joinRoomPassword).trim()

    const payload = await emitWithAck<{ pin: string; playerKey: string }>('player:joinRoom', {
      name: joinName,
      pin: normalizedPin,
      playerKey: playerKey || undefined,
      roomPassword: normalizedRoomPassword || undefined,
    })

    writeStoredSession({
      role: 'player',
      pin: payload.pin,
      name: joinName,
      playerKey: payload.playerKey,
      roomPassword: normalizedRoomPassword,
    })
  }

  const joinRoomFromDirectory = async (item: RoomDirectoryItem) => {
    const normalizedPin = item.pin.trim().toUpperCase()
    setMode('join')
    setJoinPin(normalizedPin)

    if (item.hasPassword && !joinRoomPassword.trim()) {
      setNotice('Комната защищена паролем. Введите пароль и нажмите «Войти в комнату».')
      return
    }

    try {
      await joinRoomRequest({
        pin: normalizedPin,
        roomPassword: joinRoomPassword,
      })
      setNotice('Ты подключен к игре.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось подключиться к комнате.')
    }
  }

  const joinRoom = async (event: FormEvent) => {
    event.preventDefault()

    try {
      await joinRoomRequest()
      setNotice('Ты подключен к игре.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось подключиться к комнате.')
    }
  }

  const registerAccount = async () => {
    const username = authUsername.trim()
    const password = authPassword

    if (!username || !password) {
      setNotice('Введите логин и пароль.')
      return
    }

    if (!profileFirstName.trim() || !profileNickname.trim() || !profileAge.trim() || !profileActivity.trim()) {
      setNotice('Для регистрации заполните имя, ник, возраст и сферу деятельности.')
      return
    }

    setAuthBusy(true)
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          firstName: profileFirstName,
          lastName: profileLastName,
          nickname: profileNickname,
          age: Number(profileAge),
          activity: profileActivity,
          avatarUrl: profileAvatarUrl,
          bio: profileBio,
        }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string; token?: string; profile?: UserProfile }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Не удалось зарегистрироваться.')
      }

      if (payload.token) {
        writeStoredAuthToken(payload.token)
        setAuthToken(payload.token)
      }
      if (payload.profile) {
        setAuthProfile(payload.profile)
      }
      await fetchProfileData(username)
      await fetchLeaderboardData()
      await fetchHistoryData()
      await fetchFriendsData()
      await fetchChatsData(true)
      setRegisterMode(false)
      setNotice('Профиль зарегистрирован.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка регистрации.')
    } finally {
      setAuthBusy(false)
    }
  }

  const loginAccount = async (event: FormEvent) => {
    event.preventDefault()
    const username = authUsername.trim()
    const password = authPassword

    if (!username || !password) {
      setNotice('Введите логин и пароль.')
      return
    }

    setAuthBusy(true)
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string; token?: string; profile?: UserProfile }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Не удалось войти.')
      }

      if (payload.token) {
        writeStoredAuthToken(payload.token)
        setAuthToken(payload.token)
      }
      if (payload.profile) {
        setAuthProfile(payload.profile)
      }
      await fetchProfileData(username)
      await fetchLeaderboardData()
      await fetchHistoryData()
      await fetchFriendsData()
      await fetchChatsData(true)
      setRegisterMode(false)
      setNotice('Вход выполнен.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка входа.')
    } finally {
      setAuthBusy(false)
    }
  }

  const logoutProfile = async () => {
    try {
      if (authToken) {
        await authFetch(`${SERVER_URL}/api/auth/logout`, { method: 'POST' })
      }
    } catch {
      void 0
    }
    clearStoredAuthToken()
    setAuthToken('')
    setAuthProfile(null)
    setProfileGames([])
    setProfileAchievements([])
    setProfileFriendsCount(0)
    setFriendOverview(null)
    setFriendInvites({ incoming: [], outgoing: [] })
    setFriendSearchResults([])
    setChatThreads([])
    setChatMessages([])
    setChatDraft('')
    setChatSearchFilter('')
    setActiveChatPeer(null)
    setPublicProfileCard(null)
    setPublicProfileModalOpen(false)
    setNotice('Вы вышли из аккаунта.')
  }

  const saveProfile = async () => {
    if (!authToken || !authProfile) {
      setNotice('Сначала выполните вход.')
      return
    }

    if (!profileFirstName.trim() || !profileNickname.trim() || !profileAge.trim() || !profileActivity.trim()) {
      setNotice('Поля имя, ник, возраст и сфера деятельности обязательны.')
      return
    }

    setAuthBusy(true)
    try {
      const response = await authFetch(`${SERVER_URL}/api/profile/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profileFirstName,
          lastName: profileLastName,
          nickname: profileNickname,
          age: Number(profileAge),
          activity: profileActivity,
          avatarUrl: profileAvatarUrl,
          bio: profileBio,
        }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string; profile?: UserProfile }
      if (!response.ok || !payload?.ok || !payload.profile) {
        throw new Error(payload?.error || 'Не удалось сохранить профиль.')
      }
      setAuthProfile(payload.profile)
      applyProfileToForm(payload.profile)
      await fetchProfileData(payload.profile.username)
      await fetchLeaderboardData()
      setNotice('Профиль обновлён.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка обновления профиля.')
    } finally {
      setAuthBusy(false)
    }
  }

  const onAvatarFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 900 * 1024) {
      setNotice('Фото слишком большое. Выберите файл до 900KB.')
      return
    }

    const nextValue = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Не удалось загрузить изображение.'))
      reader.readAsDataURL(file)
    }).catch(() => '')

    if (!nextValue) {
      setNotice('Не удалось обработать фото.')
      return
    }
    setProfileAvatarUrl(nextValue)
  }

  const searchFriends = async () => {
    const query = friendSearchQuery.trim()
    if (!authToken) {
      setNotice('Сначала войдите в аккаунт.')
      return
    }
    if (query.length < 2) {
      setFriendSearchResults([])
      return
    }

    setFriendSearchBusy(true)
    try {
      const response = await authFetch(`${SERVER_URL}/api/users/search?query=${encodeURIComponent(query)}&limit=20`)
      const payload = (await response.json()) as { ok?: boolean; error?: string; items?: FriendUser[] }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Не удалось выполнить поиск.')
      }
      setFriendSearchResults(Array.isArray(payload.items) ? payload.items : [])
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка поиска пользователей.')
    } finally {
      setFriendSearchBusy(false)
    }
  }

  const openPublicProfile = async (username: string) => {
    const safeUsername = username.trim()
    if (!safeUsername) return
    setPublicProfileModalOpen(true)
    setPublicProfileCard(null)
    setPublicProfileBusy(true)
    try {
      const response = await authFetch(`${SERVER_URL}/api/profile/${encodeURIComponent(safeUsername)}?limit=10`)
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
      } & PublicProfilePayload
      if (!response.ok || !payload?.ok || !payload.profile) {
        throw new Error(payload?.error || 'Профиль не найден.')
      }
      setPublicProfileCard({
        profile: payload.profile,
        games: Array.isArray(payload.games) ? payload.games : [],
        achievements: Array.isArray(payload.achievements) ? payload.achievements : [],
        social: payload.social || { friendsCount: 0 },
        friendshipStatus: payload.friendshipStatus || 'none',
      })
    } catch (error) {
      setPublicProfileModalOpen(false)
      setNotice(error instanceof Error ? error.message : 'Не удалось открыть профиль.')
    } finally {
      setPublicProfileBusy(false)
    }
  }

  const requestFriend = async (username: string) => {
    if (!authToken) {
      setNotice('Сначала войдите в аккаунт.')
      return
    }
    try {
      const response = await authFetch(`${SERVER_URL}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string; status?: string }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Не удалось отправить заявку.')
      }
      await fetchFriendsData()
      await searchFriends()
      await fetchChatsData(true)
      if (publicProfileCard?.profile.username.toLowerCase() === username.trim().toLowerCase()) {
        await openPublicProfile(username)
      }
      setNotice(payload.status === 'accepted' ? 'Пользователь добавлен в друзья.' : 'Заявка в друзья отправлена.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка отправки заявки.')
    }
  }

  const resolveFriendRequest = async (requestId: number, action: 'accept' | 'decline') => {
    if (!authToken) return
    try {
      const response = await authFetch(`${SERVER_URL}/api/friends/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Не удалось обновить заявку.')
      }
      await fetchFriendsData()
      await searchFriends()
      await fetchChatsData(true)
      setNotice(action === 'accept' ? 'Заявка принята.' : 'Заявка отклонена.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка обработки заявки.')
    }
  }

  const sendFriendGameInvite = async (username: string) => {
    if (!authToken) {
      setNotice('Сначала войдите в аккаунт.')
      return
    }
    const pin = friendInvitePin.trim().toUpperCase()
    if (pin.length < 4) {
      setNotice('Укажите PIN комнаты, чтобы отправить приглашение.')
      return
    }

    try {
      const response = await authFetch(`${SERVER_URL}/api/friends/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          pin,
          theme: friendInviteTheme.trim() || normalizedTheme,
          message: friendInviteMessage.trim(),
        }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Не удалось отправить приглашение.')
      }
      await fetchFriendsData()
      await fetchChatsData(true)
      setNotice(`Приглашение в комнату ${pin} отправлено.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка отправки приглашения.')
    }
  }

  const resolveGameInvite = async (inviteId: number, action: 'accept' | 'decline') => {
    if (!authToken) return
    try {
      const response = await authFetch(`${SERVER_URL}/api/friends/invites/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId, action }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Не удалось обработать приглашение.')
      }
      await fetchFriendsData()
      await fetchChatsData(true)
      setNotice(action === 'accept' ? 'Приглашение принято.' : 'Приглашение отклонено.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка обработки приглашения.')
    }
  }

  const sendChat = async (event: FormEvent) => {
    event.preventDefault()
    if (!authToken) {
      setNotice('Сначала войдите в аккаунт.')
      return
    }
    if (!activeChatPeer) {
      setNotice('Выберите диалог для отправки сообщения.')
      return
    }
    const text = chatDraft.trim()
    if (!text) return

    setChatSending(true)
    try {
      const response = await authFetch(`${SERVER_URL}/api/chats/${encodeURIComponent(activeChatPeer.username)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Не удалось отправить сообщение.')
      }
      setChatDraft('')
      await loadChatMessages(activeChatPeer.username, true)
      await fetchChatsData(true)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка отправки сообщения.')
    } finally {
      setChatSending(false)
    }
  }

  const openHistoryGame = async (gameId: number) => {
    if (!Number.isInteger(gameId)) return
    setHistoryBusy(true)
    try {
      const response = await fetch(`${SERVER_URL}/api/history/${gameId}`)
      const payload = (await response.json()) as { ok?: boolean; error?: string } & GameDetails
      if (!response.ok || !payload?.ok || !payload.game) {
        throw new Error(payload?.error || 'Не удалось загрузить матч.')
      }
      setSelectedHistoryGame({
        game: payload.game,
        players: Array.isArray(payload.players) ? payload.players : [],
        summary: payload.summary || null,
      })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка загрузки матча.')
    } finally {
      setHistoryBusy(false)
    }
  }

  const downloadHistoryCertificate = async () => {
    if (!selectedHistoryGame) return

    const players = selectedHistoryGame.players || []
    const rosterA = players.filter((item) => item.team === 'A').map((item) => item.username)
    const rosterB = players.filter((item) => item.team === 'B').map((item) => item.username)
    const mvp = [...players].sort((a, b) => b.points - a.points || b.correct - a.correct || b.accuracy - a.accuracy)[0]
    const summaryRounds = selectedHistoryGame.summary?.roundHistory?.length || 0
    const expectedRounds =
      selectedHistoryGame.game.format === 'teams'
        ? Math.max(2, Math.max(selectedHistoryGame.game.scoreA, selectedHistoryGame.game.scoreB, 1) * 2)
        : Math.max(1, players.length) * 5

    const svg = buildCertificateSvg({
      title: 'СЕРТИФИКАТ МАТЧА',
      subtitle: 'История игры QuizBattle',
      theme: selectedHistoryGame.game.theme,
      winner:
        selectedHistoryGame.game.format === 'ffa'
          ? `Победитель: ${selectedHistoryGame.game.winner || 'Не определен'}`
          : `Победитель: ${selectedHistoryGame.game.winner || 'Ничья'}`,
      score:
        selectedHistoryGame.game.format === 'teams'
          ? `Счет: Команда A ${selectedHistoryGame.game.scoreA} : ${selectedHistoryGame.game.scoreB} Команда B`
          : `Режим FFA, участников: ${players.length}`,
      roundsLine: `Раундов: ${summaryRounds || '—'} из ${expectedRounds}`,
      modes: selectedHistoryGame.game.format === 'ffa' ? 'Соло-формат' : 'Командный формат',
      participantsLine:
        selectedHistoryGame.game.format === 'teams'
          ? `Состав: A(${rosterA.length}) ${formatRoster(rosterA, 4)} | B(${rosterB.length}) ${formatRoster(rosterB, 4)}`
          : `Участники (${players.length}): ${formatRoster(players.map((item) => item.username), 8)}`,
      bestPlayerLine: mvp
        ? `MVP: ${mvp.username} • ${mvp.points} очк. • ${mvp.accuracy}%`
        : 'MVP: данные отсутствуют',
      dateLabel: formatDateTime(selectedHistoryGame.game.finishedAt),
      pin: selectedHistoryGame.game.pin || '—',
    })

    const fileName = `quizbattle-history-certificate-${selectedHistoryGame.game.pin || selectedHistoryGame.game.id}.svg`
    try {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setNotice(`Сертификат матча сохранен: ${fileName}`)
    } catch {
      setNotice('Не удалось скачать сертификат матча.')
    }
  }

  const startGame = async () => {
    try {
      await emitWithAck('host:startGame', {})
      setNotice('Матч запущен.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка запуска.')
    }
  }

  const togglePause = async () => {
    try {
      await emitWithAck('host:togglePause', {})
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось переключить паузу.')
    }
  }

  const skipRound = async () => {
    try {
      await emitWithAck('host:skipRound', {})
      setNotice('Раунд пропущен ведущим.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось пропустить раунд.')
    }
  }

  const nextRound = async () => {
    try {
      await emitWithAck('host:nextRound', {})
      setNotice('Переход к следующему вопросу выполнен.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось перейти к следующему вопросу.')
    }
  }

  const kickPlayer = async (participantId: string, playerName: string) => {
    try {
      await emitWithAck('host:kickPlayer', { participantId })
      setNotice(`${playerName} дисквалифицирован(а).`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось дисквалифицировать игрока.')
    }
  }

  const exportResults = async () => {
    try {
      const payload = await emitWithAck<{ fileName: string; filePath: string }>('host:exportResults', {})
      setNotice(`Результаты сохранены: ${payload.fileName}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить результаты.')
    }
  }

  const leaveRoom = async () => {
    try {
      await emitWithAck('player:leaveRoom', {})
    } catch (error) {
      void error
    }

    clearStoredSession()
    setRoomState(null)
  }

  const submitVote = async (payload: { answerIndex?: number; pass?: boolean }) => {
    if (submitting) return

    setSubmitting(true)
    try {
      await emitWithAck('round:submitAnswer', payload)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось отправить ответ.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitAnswer = async (answerIndex: number) => {
    await submitVote({ answerIndex })
  }

  const submitPass = async () => {
    await submitVote({ pass: true })
  }

  const switchTeam = async (team: TeamId) => {
    try {
      await emitWithAck('player:switchTeam', { team })
      setNotice(`Переход в ${teamTitle[team]} выполнен.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сменить команду.')
    }
  }

  const copyInviteLink = async () => {
    if (!roomState) return

    try {
      await navigator.clipboard.writeText(roomState.inviteLink)
      setNotice('Ссылка приглашения скопирована.')
    } catch {
      setNotice('Не удалось скопировать ссылку.')
    }
  }

  const shareMatchResult = async () => {
    if (!roomState || roomState.status !== 'finished') return

    const baseText = [
      `QuizBattle • ${roomState.theme}`,
      roomState.resultHeadline,
      roomState.format === 'teams'
        ? `Счёт: Команда A ${roomState.scores.A} : ${roomState.scores.B} Команда B`
        : roomState.ffaLeaderboard.length > 0
          ? `Победитель: ${roomState.ffaLeaderboard[0].name}, очки: ${roomState.ffaLeaderboard[0].points}`
          : 'Игра завершена.',
      `PIN комнаты: ${roomState.pin}`,
      `Сервис: ${roomState.inviteLink}`,
    ].join('\n')

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `QuizBattle — ${roomState.theme}`,
          text: baseText,
        })
        setNotice('Результат отправлен.')
        return
      } catch (error) {
        void error
      }
    }

    try {
      await navigator.clipboard.writeText(baseText)
      setNotice('Итог матча скопирован в буфер.')
    } catch {
      setNotice('Не удалось поделиться итогом.')
    }
  }

  const downloadCertificate = async () => {
    if (!roomState || roomState.status !== 'finished') return

    const dateLabel = new Date().toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const scoreLine =
      roomState.format === 'teams'
        ? `Финальный счет: Команда A ${roomState.scores.A} : ${roomState.scores.B} Команда B`
        : roomState.ffaLeaderboard.length > 0
          ? `Победитель FFA: ${roomState.ffaLeaderboard[0].name} (${roomState.ffaLeaderboard[0].points} очк.)`
          : 'Матч завершен'
    const participantPool = roomState.playerStats.filter((item) => item.team === 'A' || item.team === 'B')
    const participantCount =
      participantPool.length > 0 ? participantPool.length : roomState.participants.filter((item) => !item.isHost).length
    const roundsExpected =
      roomState.format === 'teams'
        ? roomState.questionCount * 2
        : roomState.questionCount * Math.max(1, participantCount)
    const roundsLine = `Раундов сыграно: ${roomState.roundHistory.length} из ${roundsExpected}`
    const packageModes = roomModeLabels.length > 0 ? roomModeLabels.join(' • ') : 'Смешанный режим'
    const modes = `Матч: ${roomState.gameMode?.label || 'Командная дуэль'} • Пакеты: ${packageModes}`
    const rosterA = participantPool.filter((item) => item.team === 'A').map((item) => item.name)
    const rosterB = participantPool.filter((item) => item.team === 'B').map((item) => item.name)
    const participantsLine =
      roomState.format === 'teams'
        ? `Состав: A(${rosterA.length}) ${formatRoster(rosterA, 4)} | B(${rosterB.length}) ${formatRoster(rosterB, 4)}`
        : `Участники (${participantCount}): ${formatRoster(participantPool.map((item) => item.name), 8)}`
    const bestPlayer = [...participantPool].sort(
      (a, b) => b.points - a.points || b.correct - a.correct || b.accuracy - a.accuracy || a.name.localeCompare(b.name, 'ru'),
    )[0]
    const bestPlayerLine = bestPlayer
      ? `MVP матча: ${bestPlayer.name} • ${bestPlayer.points} очк., точность ${bestPlayer.accuracy}%`
      : 'MVP матча: определяется по итогам всех раундов'

    const svg = buildCertificateSvg({
      title: 'СЕРТИФИКАТ УЧАСТНИКА',
      subtitle: 'Официальный результат матча QuizBattle',
      theme: roomState.theme,
      winner: trimLine(roomState.resultHeadline, 80),
      score: trimLine(scoreLine, 96),
      roundsLine: trimLine(roundsLine, 96),
      modes: trimLine(modes, 96),
      participantsLine: trimLine(participantsLine, 100),
      bestPlayerLine: trimLine(bestPlayerLine, 100),
      dateLabel,
      pin: roomState.pin,
    })

    const fileName = `quizbattle-certificate-${roomState.pin}.svg`
    try {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setNotice(`Сертификат скачан: ${fileName}`)
    } catch {
      setNotice('Не удалось скачать сертификат.')
    }
  }

  const me = roomState?.me
  const isHost = Boolean(me?.isHost)
  const isFfa = roomState?.format === 'ffa'
  const canSwitchTeam =
    Boolean(roomState) &&
    roomState?.format === 'teams' &&
    roomState?.status === 'lobby' &&
    Boolean(me) &&
    !isHost &&
    (me?.team === 'A' || me?.team === 'B')

  const teamMembers = useMemo(() => {
    if (!roomState) return { A: [], B: [], HOST: [] }

    return {
      A: roomState.participants.filter((participant) => participant.team === 'A'),
      B: roomState.participants.filter((participant) => participant.team === 'B'),
      HOST: roomState.participants.filter((participant) => participant.team === 'HOST'),
    }
  }, [roomState])

  const activeRound = roomState?.activeRound
  const teamVoting = activeRound?.teamVoting || null
  const myVoteIndex = teamVoting?.myVoteIndex ?? null
  const myPassed = Boolean(teamVoting?.myPassed)
  const activeTurnLabel = useMemo(() => {
    if (!roomState || !activeRound) return ''
    if (roomState.format === 'ffa') return activeRound.playerName || 'Игрок'
    return teamTitle[activeRound.team]
  }, [activeRound, roomState])

  const timerProgress = useMemo(() => {
    if (!activeRound || !roomState) return 0
    const max = activeRound.roundDurationMs || roomState.timerSeconds * 1000
    if (max <= 0) return 0
    return Math.max(0, Math.min(100, (activeRound.timeLeftMs / max) * 100))
  }, [activeRound, roomState])

  const syncedTimeLeft = useMemo(() => {
    if (!activeRound || !roomState) return 0
    const drift = localClockMs - roomState.serverTime
    return Math.max(0, activeRound.timeLeftMs - drift)
  }, [activeRound, localClockMs, roomState])

  const roomModeLabels = useMemo(() => {
    if (!roomState) return []
    return roomState.selectedModes.map((modeId) => modeCatalog.find((item) => item.id === modeId)?.label || modeId)
  }, [roomState])

  const roundHistory = roomState?.roundHistory || []
  const roomPin = roomState?.pin || ''
  const roomStatus = roomState?.status || 'lobby'
  const roundHistoryLength = roundHistory.length
  const safeFinalHistoryIndex = roundHistory.length === 0 ? 0 : Math.min(finalHistoryIndex, roundHistory.length - 1)
  const selectedHistoryEntry = roundHistory[safeFinalHistoryIndex] || null
  const selectedHistoryPresentation = getReviewPresentation(selectedHistoryEntry?.submission)

  const finalSummary = useMemo(() => {
    if (!roomState) {
      return {
        totalRounds: 0,
        expectedRounds: 0,
        correctRounds: 0,
        wrongRounds: 0,
        timeoutRounds: 0,
        passRounds: 0,
        skippedRounds: 0,
        accuracy: 0,
        avgResponseSeconds: 0,
        fastestCorrect: null as null | RoomState['roundHistory'][number],
        bestPlayer: null as null | RoomState['playerStats'][number],
        rosterA: [] as string[],
        rosterB: [] as string[],
        participantCount: 0,
      }
    }

    const history = roomState.roundHistory || []
    let correctRounds = 0
    let wrongRounds = 0
    let timeoutRounds = 0
    let passRounds = 0
    let skippedRounds = 0
    let elapsedTotal = 0
    let elapsedCount = 0

    history.forEach((entry) => {
      const submission = entry.submission
      if (submission.type === 'timeout') {
        timeoutRounds += 1
        return
      }
      if (submission.type === 'pass') {
        passRounds += 1
        return
      }
      if (submission.type === 'skip') {
        skippedRounds += 1
        return
      }

      elapsedTotal += Math.max(0, submission.elapsedMs)
      elapsedCount += 1
      if (submission.correct) correctRounds += 1
      else wrongRounds += 1
    })

    const participantPool = roomState.playerStats.filter((item) => item.team === 'A' || item.team === 'B')
    const participantCount =
      participantPool.length > 0 ? participantPool.length : roomState.participants.filter((item) => !item.isHost).length
    const expectedRounds =
      roomState.format === 'teams'
        ? roomState.questionCount * 2
        : roomState.questionCount * Math.max(1, participantCount)
    const accuracy = history.length > 0 ? Math.round((correctRounds / history.length) * 100) : 0
    const avgResponseSeconds = elapsedCount > 0 ? Number((elapsedTotal / elapsedCount / 1000).toFixed(1)) : 0

    const fastestCorrect =
      history
        .filter((entry) => entry.submission?.correct)
        .sort((a, b) => a.submission.elapsedMs - b.submission.elapsedMs)[0] || null

    const bestPlayer =
      [...participantPool].sort(
        (a, b) => b.points - a.points || b.correct - a.correct || b.accuracy - a.accuracy || a.name.localeCompare(b.name, 'ru'),
      )[0] || null

    const rosterA = participantPool.filter((item) => item.team === 'A').map((item) => item.name)
    const rosterB = participantPool.filter((item) => item.team === 'B').map((item) => item.name)

    return {
      totalRounds: history.length,
      expectedRounds,
      correctRounds,
      wrongRounds,
      timeoutRounds,
      passRounds,
      skippedRounds,
      accuracy,
      avgResponseSeconds,
      fastestCorrect,
      bestPlayer,
      rosterA,
      rosterB,
      participantCount,
    }
  }, [roomState])

  useEffect(() => {
    if (roomStatus !== 'finished') return
    setFinalHistoryIndex(Math.max(0, roundHistoryLength - 1))
  }, [roomPin, roomStatus, roundHistoryLength])

  useEffect(() => {
    if (roomStatus !== 'finished') return
    const maxIndex = Math.max(0, roundHistoryLength - 1)
    setFinalHistoryIndex((current) => Math.min(current, maxIndex))
  }, [roomStatus, roundHistoryLength])

  useEffect(() => {
    if (!roomState || roomState.status !== 'running' || !activeRound) return
    if (lastRoundSignalRef.current === activeRound.key) return
    lastRoundSignalRef.current = activeRound.key
    void playSignal('round')
    lastCountdownRef.current = -1
  }, [roomState, activeRound, playSignal])

  useEffect(() => {
    if (!activeRound?.currentSubmission) return
    const submission = activeRound.currentSubmission
    const signalKey = `${activeRound.key}:${submission.type}:${submission.byName}:${submission.correct ? 1 : 0}`
    if (lastSubmissionSignalRef.current === signalKey) return
    lastSubmissionSignalRef.current = signalKey

    if (submission.type === 'timeout' || submission.type === 'skip' || submission.type === 'pass') {
      void playSignal('warn')
      return
    }

    void playSignal(submission.correct ? 'ok' : 'fail')
  }, [activeRound, playSignal])

  useEffect(() => {
    if (!activeRound || roomState?.status !== 'running') return
    if (!activeRound.canAnswer) return

    const seconds = Math.ceil(syncedTimeLeft / 1000)
    if (seconds > 5 || seconds <= 0) return
    if (lastCountdownRef.current === seconds) return
    lastCountdownRef.current = seconds
    void playSignal('warn')
  }, [activeRound, roomState, syncedTimeLeft, playSignal])

  const toggleQuestionPack = (id: string) => {
    setSelectedModes((current) => {
      if (current.includes(id)) {
        if (current.length <= 1) return current
        return current.filter((modeItem) => modeItem !== id)
      }
      return [...current, id]
    })
  }

  const openedGameplayMode = modeInfoOpen
    ? gameplayModeCatalog.find((item) => item.id === modeInfoOpen) || null
    : null

  const landingPageMeta: Record<LandingPage, { title: string; subtitle: string; tags: string[] }> = {
    play: {
      title: 'Режим игры и лобби',
      subtitle: 'Создавайте комнаты, настраивайте матч и запускайте игру в реальном времени.',
      tags: ['Сценарий ведущего', 'Быстрый вход по PIN', 'AI-генерация'],
    },
    rooms: {
      title: 'Поиск и подключение к комнатам',
      subtitle: 'Список активных лобби, фильтры по теме и быстрый вход в нужную игру.',
      tags: ['Каталог комнат', 'Фильтры', 'Вход в лобби'],
    },
    account: {
      title: 'Аккаунт и профиль игрока',
      subtitle: 'Регистрация, вход, редактирование профиля, аватар и личные достижения.',
      tags: ['Регистрация', 'Профиль', 'Достижения'],
    },
    community: {
      title: 'Друзья и приглашения',
      subtitle: 'Поиск игроков, дружба, приглашения в лобби и быстрый переход к матчу.',
      tags: ['Социальный граф', 'Инвайты', 'Публичные профили'],
    },
    leaderboard: {
      title: 'Лидерборд проекта',
      subtitle: 'Рейтинг зарегистрированных игроков с победами, матчами и общими очками.',
      tags: ['Топ игроков', 'Соревнование', 'Геймификация'],
    },
    history: {
      title: 'История матчей',
      subtitle: 'Просмотр завершённых игр, статистики участников и сертификата матча.',
      tags: ['Архив игр', 'Детальная аналитика', 'Сертификаты'],
    },
  }

  const landingMeta = landingPageMeta[landingPage]
  const myLeaderboardPosition =
    authProfile
      ? leaderboard.findIndex((item) => item.username.toLowerCase() === authProfile.username.toLowerCase()) + 1
      : 0
  const chatFilterMask = chatSearchFilter.trim().toLowerCase()
  const filteredChatThreads = useMemo(() => {
    if (!chatFilterMask) return chatThreads
    return chatThreads.filter((item) => {
      const haystack = [item.peer.displayName, item.peer.username, item.peer.firstName, item.peer.lastName]
        .join(' ')
        .toLowerCase()
      return haystack.includes(chatFilterMask)
    })
  }, [chatFilterMask, chatThreads])

  const renderAchievementCard = (achievement: ProfileAchievement) => {
    const visual = achievementVisuals[achievement.key] || { icon: '⭐', color: '#15a66d' }
    const target = Math.max(1, Number(achievement.target || 1))
    const progress = Math.max(0, Number(achievement.progress || 0))
    const progressRatio = Math.min(100, Math.round((progress / target) * 100))

    return (
      <article
        key={achievement.key}
        className={clsx('achievement-card', achievement.unlocked && 'achievement-card-unlocked')}
        style={{ '--achievement-color': visual.color } as CSSProperties}
      >
        <div className="achievement-head">
          <span className="achievement-icon" aria-hidden="true">
            {visual.icon}
          </span>
          <h4>{achievement.title}</h4>
          <span className="achievement-hint" aria-label={`Условие: ${achievement.description}`}>
            i
            <span className="achievement-tooltip">Чтобы выполнить: {achievement.description}</span>
          </span>
        </div>
        <p>{achievement.description}</p>
        <div className="achievement-progress-line">
          <span style={{ width: `${progressRatio}%` }} />
        </div>
        <p className="achievement-progress-meta">
          {progress}/{target} • {progressRatio}%
        </p>
      </article>
    )
  }

  if (!roomState) {
    return (
      <div className={clsx('site-shell', uiTheme === 'dark' && 'theme-dark')}>
        <div className="app-frame">
          <header className="topbar">
            <div className="brand-lockup">
              <span className="brand-mark">Q</span>
              <div className="brand-copy">
                <strong>QuizBattle</strong>
                <span>Sber Hack Edition</span>
              </div>
            </div>

            <div className="topbar-actions">
              <span className="top-pill">Realtime Multiplayer</span>
              {authProfile ? <span className="top-pill">Профиль: {authProfile.displayName}</span> : <span className="top-pill">Гость</span>}
              <div className="quick-toggles">
                <button
                  type="button"
                  className={clsx('toggle-chip', uiTheme === 'dark' && 'toggle-chip-active')}
                  onClick={() => setUiTheme((current) => (current === 'light' ? 'dark' : 'light'))}
                >
                  {uiTheme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
                </button>
                <button
                  type="button"
                  className={clsx('toggle-chip', soundEnabled && 'toggle-chip-active')}
                  onClick={() => setSoundEnabled((current) => !current)}
                >
                  {soundEnabled ? 'Звук: On' : 'Звук: Off'}
                </button>
              </div>
              <div className="status-chip">
                <span className={connected ? 'dot connected' : 'dot'} />
                {connected ? 'Сервер онлайн' : 'Сервер недоступен'}
              </div>
            </div>
          </header>

          <section className="hero-card">
            <div className="hero-content">
              <p className="kicker">Sber Quiz Platform</p>
              <h1>{landingMeta.title}</h1>
              <p className="hero-subtitle">{landingMeta.subtitle}</p>
              <div className="hero-tags">
                {landingMeta.tags.map((tag) => (
                  <span key={tag} className="hero-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="hero-metrics">
              <article className="metric-card">
                <span>Форматов матча</span>
                <strong>{gameplayModeCatalog.length}</strong>
              </article>
              <article className="metric-card">
                <span>Пакеты генерации</span>
                <strong>{selectedModes.length}</strong>
              </article>
              <article className="metric-card">
                <span>Игроков в рейтинге</span>
                <strong>{leaderboard.length}</strong>
              </article>
              <article className="metric-card">
                <span>История матчей</span>
                <strong>{recentGames.length}</strong>
              </article>
            </div>
          </section>

          <section className="portal-nav">
            {([
              { key: 'play', label: 'Играть' },
              { key: 'rooms', label: 'Комнаты' },
              { key: 'account', label: 'Аккаунт' },
              { key: 'community', label: 'Друзья' },
              { key: 'leaderboard', label: 'Лидерборд' },
              { key: 'history', label: 'История' },
            ] as Array<{ key: LandingPage; label: string }>).map((item) => (
              <button
                key={item.key}
                type="button"
                className={clsx('portal-nav-btn', landingPage === item.key && 'portal-nav-btn-active')}
                onClick={() => setLandingPage(item.key)}
              >
                {item.label}
              </button>
            ))}
          </section>

          {landingPage === 'play' && (
            <main className="lobby-layout">
              <section className="panel panel-control">
                <div className="panel-head">Настройка матча</div>

                <div className="mode-switch">
                  <button
                    type="button"
                    className={clsx('mode-btn', mode === 'host' && 'mode-btn-active')}
                    onClick={() => setMode('host')}
                  >
                    Ведущий
                  </button>
                  <button
                    type="button"
                    className={clsx('mode-btn', mode === 'join' && 'mode-btn-active')}
                    onClick={() => setMode('join')}
                  >
                    Игрок
                  </button>
                </div>

                {mode === 'host' ? (
                  <form className="entry-form" onSubmit={(event) => void createRoom(event)}>
                    <label htmlFor="hostName">Имя ведущего</label>
                    <input
                      id="hostName"
                      value={hostName}
                      onChange={(event) => setHostName(event.target.value)}
                      placeholder="Например: Влад"
                    />

                    <label htmlFor="theme">Тема матча</label>
                    <input
                      id="theme"
                      list="theme-suggestions"
                      value={theme}
                      onChange={(event) => setTheme(event.target.value)}
                      placeholder="Например: История России"
                    />
                    <datalist id="theme-suggestions">
                      {themeSuggestions.map((topic) => (
                        <option key={topic} value={topic} />
                      ))}
                    </datalist>

                    <div className="inline-fields">
                      <div>
                        <label htmlFor="audience">Целевая аудитория</label>
                        <select
                          id="audience"
                          value={audience}
                          onChange={(event) => setAudience(event.target.value as AudienceMode)}
                        >
                          {audienceCatalog.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="tone">Стиль раундов</label>
                        <select
                          id="tone"
                          value={tone}
                          onChange={(event) => setTone(event.target.value as ToneMode)}
                        >
                          {toneCatalog.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="summary-note">AI-пайплайн определяется сервером и не требует выбора пользователя.</div>

                    <div className="inline-fields">
                      <div>
                        <label htmlFor="difficultyMode">Сложность вопросов</label>
                        <select
                          id="difficultyMode"
                          value={difficultyMode}
                          onChange={(event) => setDifficultyMode(event.target.value as DifficultyMode)}
                        >
                          <option value="mixed">Смешанная</option>
                          <option value="easy">Легкая</option>
                          <option value="medium">Средняя</option>
                          <option value="hard">Сложная</option>
                        </select>
                      </div>
                      <div>
                        <label>Режим матча</label>
                        <div className="summary-note">
                          {selectedGameplayMode.icon} {selectedGameplayMode.title}
                        </div>
                        <div className="summary-note">
                          Формат:{' '}
                          {selectedGameplayMode.id === 'duel_1v1'
                            ? 'Дуэль 1v1'
                            : selectedGameplayMode.format === 'ffa'
                              ? 'Все против всех'
                              : 'Команды A/B'}
                        </div>
                      </div>
                    </div>

                    <div className="inline-fields">
                      <div>
                        <label htmlFor="questionCount">Вопросов на команду</label>
                        <select
                          id="questionCount"
                          value={questionCount}
                          onChange={(event) => setQuestionCount(Number(event.target.value))}
                        >
                          {[5, 6, 7].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="timerSeconds">Таймер (сек)</label>
                        <input
                          id="timerSeconds"
                          type="number"
                          min={10}
                          max={60}
                          value={timerSeconds}
                          onChange={(event) => setTimerSeconds(Number(event.target.value))}
                        />
                      </div>
                    </div>

                    <div className="inline-fields">
                      <div>
                        <label htmlFor="roomPassword">Пароль комнаты (опц.)</label>
                        <input
                          id="roomPassword"
                          value={roomPassword}
                          onChange={(event) => setRoomPassword(event.target.value)}
                          placeholder="Оставь пустым, если не нужен"
                        />
                      </div>
                      <div className="checkbox-field">
                        <label htmlFor="speedBonusEnabled">Бонус за скорость</label>
                        <button
                          type="button"
                          id="speedBonusEnabled"
                          className={clsx('toggle-chip', speedBonusEnabled && 'toggle-chip-active')}
                          onClick={() => {
                            if (speedBonusLockedByMode) return
                            setSpeedBonusEnabled((current) => !current)
                          }}
                          disabled={speedBonusLockedByMode}
                        >
                          {speedBonusLockedByMode
                            ? 'Фиксирован режимом матча'
                            : speedBonusEnabled
                              ? 'Включен (+0..+2)'
                              : 'Выключен (только 1 балл)'}
                        </button>
                      </div>
                    </div>

                    <button type="submit" className="action-btn">
                      Создать матч
                    </button>
                  </form>
                ) : (
                  <div className="join-flow">
                    <form className="entry-form" onSubmit={(event) => void joinRoom(event)}>
                      <label htmlFor="joinPin">PIN комнаты</label>
                      <input
                        id="joinPin"
                        value={joinPin}
                        onChange={(event) => setJoinPin(event.target.value.toUpperCase())}
                        placeholder="Например: A1B2C3"
                      />

                      <label htmlFor="joinName">Имя игрока</label>
                      <input
                        id="joinName"
                        value={joinName}
                        onChange={(event) => setJoinName(event.target.value)}
                        placeholder="Например: Катя"
                      />

                      <label htmlFor="joinRoomPassword">Пароль комнаты (если есть)</label>
                      <input
                        id="joinRoomPassword"
                        value={joinRoomPassword}
                        onChange={(event) => setJoinRoomPassword(event.target.value)}
                        placeholder="Введите пароль комнаты"
                      />

                      <button type="submit" className="action-btn">
                        Войти в комнату
                      </button>
                    </form>
                    <div className="summary-box">
                      <strong>Каталог комнат находится во вкладке «Комнаты»</strong>
                      <p>Там можно увидеть все активные лобби, найти комнату по теме и войти в один клик.</p>
                      <div className="inline-action-row">
                        <button type="button" className="outline-btn" onClick={() => setLandingPage('rooms')}>
                          Открыть комнаты
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="panel panel-modes">
                <div className="panel-head">Игровые режимы</div>
                <div className="gameplay-grid">
                  {gameplayModeCatalog.map((item) => {
                    const isSelected = gameMode === item.id

                    return (
                      <article key={item.id} className={clsx('mode-card', 'gameplay-card', isSelected && 'mode-card-active')}>
                        <span className="mode-top">
                          {item.id === 'duel_1v1' ? 'Дуэль 1v1' : item.format === 'ffa' ? 'Свободная битва' : 'Командный матч'}
                        </span>
                        <strong>
                          {item.icon} {item.title}
                        </strong>
                        <span className="mode-state">{item.tagline}</span>
                        <div className="mode-card-actions">
                          <button
                            type="button"
                            className={clsx('outline-btn', isSelected && 'team-switch-active')}
                            onClick={() => setGameMode(item.id)}
                          >
                            {isSelected ? 'Выбран' : 'Выбрать'}
                          </button>
                          <button type="button" className="outline-btn" onClick={() => setModeInfoOpen(item.id)}>
                            Подробнее
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>

                <div className="advanced-settings-box">
                  <button
                    type="button"
                    className={clsx('outline-btn', 'advanced-settings-toggle', advancedSettingsOpen && 'advanced-settings-toggle-active')}
                    onClick={() => setAdvancedSettingsOpen((current) => !current)}
                  >
                    {advancedSettingsOpen ? 'Скрыть расширенные настройки' : 'Показать расширенные настройки'}
                  </button>
                  <p className="summary-note">
                    Здесь настраиваются пакеты генерации вопросов. Для обычного старта можно не открывать этот блок.
                  </p>

                  {advancedSettingsOpen && (
                    <>
                      <p className="kicker">Пакеты вопросов</p>
                      <div className="modes-grid">
                        {modeCatalog.map((item) => {
                          const isSelected = selectedModes.includes(item.id)

                          return (
                            <button
                              type="button"
                              key={item.id}
                              className={clsx('mode-card', isSelected && 'mode-card-active')}
                              onClick={() => toggleQuestionPack(item.id)}
                            >
                              <span className="mode-top">{item.category}</span>
                              <strong>
                                {item.emoji} {item.label}
                              </strong>
                              <span className="mode-state">{isSelected ? 'Активен в генерации' : 'Не используется'}</span>
                              <p className="mode-pack-description">{item.description}</p>
                              <p className="mode-pack-effect">{item.effect}</p>
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div className="summary-box">
                  <p className="kicker">Текущая конфигурация</p>
                  <p>
                    <strong>
                      {selectedGameplayMode.icon} {selectedGameplayMode.title}
                    </strong>
                  </p>
                  <p>
                    <strong>{selectedModeTitles.length > 0 ? selectedModeTitles.join(', ') : 'Режимы не выбраны'}</strong>
                  </p>
                  <p className="summary-note">Тема генерации: {normalizedTheme}</p>
                  <p className="summary-note">
                    Формат матча:{' '}
                    {selectedGameplayMode.id === 'duel_1v1'
                      ? 'Дуэль 1v1'
                      : gameFormat === 'ffa'
                        ? 'Все против всех'
                        : 'Команды A/B'}
                  </p>
                  <p className="summary-note">Пакеты вопросов меняют содержание генерации, а не формат матча.</p>
                  <p className="summary-note">Аудитория: {selectedAudienceLabel}</p>
                  <p className="summary-note">Стиль: {selectedToneLabel}</p>
                  <p className="summary-note">Сложность: {difficultyModeLabel[difficultyMode]}</p>
                  <p className="summary-note">
                    Бонус за скорость:{' '}
                    {speedBonusLockedByMode ? 'включен и зафиксирован выбранным режимом' : speedBonusEnabled ? 'включен' : 'выключен'}
                  </p>
                  <p className="summary-note">Пароль комнаты: {roomPassword.trim() ? 'задан' : 'нет'}</p>
                  <p className="summary-note">AI: серверный интеллектуальный режим</p>
                </div>

              </section>
            </main>
          )}

          {landingPage === 'rooms' && (
            <section className="portal-layout rooms-layout">
              <article className="panel portal-main-panel">
                <div className="panel-head">Каталог комнат</div>
                <section className="room-directory">
                  <div className="room-directory-head">
                    <strong>Активные лобби</strong>
                    <button
                      type="button"
                      className="outline-btn"
                      onClick={() => void fetchRoomsDirectory()}
                      disabled={roomsDirectoryBusy}
                    >
                      {roomsDirectoryBusy ? 'Обновляем…' : 'Обновить'}
                    </button>
                  </div>

                  <label htmlFor="roomsQuery">Поиск по теме, PIN или ведущему</label>
                  <input
                    id="roomsQuery"
                    className="control-input"
                    value={roomsQuery}
                    onChange={(event) => setRoomsQuery(event.target.value)}
                    placeholder="Например: История, A1B2C3, Влад"
                  />

                  <p className="summary-note">
                    {roomsDirectoryUpdatedLabel}. Доступно комнат: <b>{roomsDirectory.length}</b>.
                  </p>

                  {roomsDirectoryBusy && roomsDirectory.length === 0 ? (
                    <p className="summary-note">Загружаем доступные лобби…</p>
                  ) : roomsDirectory.length === 0 ? (
                    <p className="summary-note">Сейчас нет открытых комнат. Создай новую или обнови список позже.</p>
                  ) : (
                    <div className="room-directory-list">
                      {roomsDirectory.map((item) => (
                        <article key={`${item.pin}-${item.createdAt}`} className="room-directory-card">
                          <div className="room-directory-card-head">
                            <strong>{item.theme}</strong>
                            <span className={clsx('room-status-pill', `room-status-${item.status}`)}>
                              {roomStatusLabel[item.status] || item.status}
                            </span>
                          </div>
                          <div className="room-directory-meta">
                            <span>PIN: {item.pin}</span>
                            <span>Ведущий: {item.hostName}</span>
                            <span>{item.playersCount} игроков</span>
                          </div>
                          <div className="room-directory-meta">
                            <span>{item.formatLabel}</span>
                            <span>{item.gameModeLabel}</span>
                            <span>{item.hasPassword ? 'С паролем' : 'Без пароля'}</span>
                          </div>
                          {item.format === 'teams' ? (
                            <div className="room-directory-meta">
                              <span>Команда A: {item.teams.A}</span>
                              <span>Команда B: {item.teams.B}</span>
                              <span>
                                {item.questionCount} вопр. • {item.timerSeconds} сек
                              </span>
                            </div>
                          ) : (
                            <div className="room-directory-meta">
                              <span>{item.questionCount} вопр.</span>
                              <span>{item.timerSeconds} сек на ход</span>
                              <span>Формат FFA</span>
                            </div>
                          )}
                          <div className="room-directory-card-foot">
                            <span className="summary-note">
                              Создана{' '}
                              {new Date(item.createdAt).toLocaleTimeString('ru-RU', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <button type="button" className="outline-btn" onClick={() => void joinRoomFromDirectory(item)}>
                              Войти в лобби
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </article>

              <aside className="panel portal-side-panel rooms-side-panel">
                <div className="panel-head">Быстрый вход</div>
                <form className="entry-form" onSubmit={(event) => void joinRoom(event)}>
                  <label htmlFor="roomsJoinName">Имя игрока</label>
                  <input
                    id="roomsJoinName"
                    value={joinName}
                    onChange={(event) => setJoinName(event.target.value)}
                    placeholder="Например: Катя"
                  />

                  <label htmlFor="roomsJoinPin">PIN комнаты</label>
                  <input
                    id="roomsJoinPin"
                    value={joinPin}
                    onChange={(event) => setJoinPin(event.target.value.toUpperCase())}
                    placeholder="Например: A1B2C3"
                  />

                  <label htmlFor="roomsJoinPassword">Пароль комнаты (если есть)</label>
                  <input
                    id="roomsJoinPassword"
                    value={joinRoomPassword}
                    onChange={(event) => setJoinRoomPassword(event.target.value)}
                    placeholder="Введите пароль"
                  />

                  <button type="submit" className="action-btn">
                    Войти в комнату
                  </button>
                </form>

                <div className="summary-box">
                  <strong>Как пользоваться</strong>
                  <p>1. Введи тему или PIN в поиске.</p>
                  <p>2. Нажми «Войти в лобби» у нужной комнаты.</p>
                  <p>3. Если стоит пароль, введи его справа и повтори вход.</p>
                </div>
              </aside>
            </section>
          )}

          {landingPage === 'account' && (
            <section className="portal-layout">
              <article className="panel portal-main-panel">
                <div className="panel-head">Аккаунт и регистрация</div>

                {!authProfile ? (
                  <>
                    <div className="mode-switch">
                      <button
                        type="button"
                        className={clsx('mode-btn', !registerMode && 'mode-btn-active')}
                        onClick={() => setRegisterMode(false)}
                      >
                        Вход
                      </button>
                      <button
                        type="button"
                        className={clsx('mode-btn', registerMode && 'mode-btn-active')}
                        onClick={() => setRegisterMode(true)}
                      >
                        Регистрация
                      </button>
                    </div>

                    <form className="entry-form" onSubmit={(event) => void loginAccount(event)}>
                      <label htmlFor="authUsername">Логин</label>
                      <input
                        id="authUsername"
                        value={authUsername}
                        onChange={(event) => setAuthUsername(event.target.value)}
                        placeholder="Например: vlad"
                      />
                      <label htmlFor="authPassword">Пароль</label>
                      <input
                        id="authPassword"
                        type="password"
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        placeholder="Минимум 6 символов"
                      />

                      {registerMode && (
                        <>
                          <div className="inline-fields">
                            <div>
                              <label htmlFor="registerFirstName">Имя</label>
                              <input
                                id="registerFirstName"
                                value={profileFirstName}
                                onChange={(event) => setProfileFirstName(event.target.value)}
                                placeholder="Владислав"
                              />
                            </div>
                            <div>
                              <label htmlFor="registerLastName">Фамилия</label>
                              <input
                                id="registerLastName"
                                value={profileLastName}
                                onChange={(event) => setProfileLastName(event.target.value)}
                                placeholder="Голосной"
                              />
                            </div>
                          </div>
                          <div className="inline-fields">
                            <div>
                              <label htmlFor="registerNickname">Ник</label>
                              <input
                                id="registerNickname"
                                value={profileNickname}
                                onChange={(event) => setProfileNickname(event.target.value)}
                                placeholder="vladik"
                              />
                            </div>
                            <div>
                              <label htmlFor="registerAge">Возраст</label>
                              <input
                                id="registerAge"
                                type="number"
                                min={8}
                                max={120}
                                value={profileAge}
                                onChange={(event) => setProfileAge(event.target.value)}
                                placeholder="18"
                              />
                            </div>
                          </div>
                          <label htmlFor="registerActivity">Сфера деятельности</label>
                          <input
                            id="registerActivity"
                            value={profileActivity}
                            onChange={(event) => setProfileActivity(event.target.value)}
                            placeholder="Студент / разработчик / преподаватель"
                          />
                          <label htmlFor="registerAvatarUrl">Фото профиля (URL или загрузка файла)</label>
                          <input
                            id="registerAvatarUrl"
                            value={profileAvatarUrl}
                            onChange={(event) => setProfileAvatarUrl(event.target.value)}
                            placeholder="https://... или data:image/..."
                          />
                          <input type="file" accept="image/*" onChange={(event) => void onAvatarFileSelected(event)} />
                          <label htmlFor="registerBio">О себе</label>
                          <input
                            id="registerBio"
                            value={profileBio}
                            onChange={(event) => setProfileBio(event.target.value)}
                            placeholder="Коротко о себе"
                          />
                        </>
                      )}

                      <div className="inline-action-row">
                        {!registerMode ? (
                          <button type="submit" className="action-btn" disabled={authBusy}>
                            {authBusy ? 'Вход...' : 'Войти'}
                          </button>
                        ) : (
                          <button type="button" className="action-btn" onClick={() => void registerAccount()} disabled={authBusy}>
                            {authBusy ? 'Создание...' : 'Создать профиль'}
                          </button>
                        )}
                        <button type="button" className="outline-btn" onClick={() => setRegisterMode((current) => !current)}>
                          {registerMode ? 'Уже есть аккаунт' : 'Нужна регистрация'}
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <>
                    <div className="profile-header-card">
                      {authProfile.avatarUrl ? (
                        <img src={authProfile.avatarUrl} alt={authProfile.displayName} className="profile-avatar" />
                      ) : (
                        <div className="profile-avatar profile-avatar-fallback">{getInitials(authProfile.displayName)}</div>
                      )}
                      <div>
                        <strong>{authProfile.displayName}</strong>
                        <p>@{authProfile.username}</p>
                        <p>
                          Рейтинг: {authProfile.rating} • Победы: {authProfile.wins} • Матчи: {authProfile.gamesPlayed}
                        </p>
                      </div>
                    </div>

                    <form className="entry-form compact-form" onSubmit={(event) => event.preventDefault()}>
                      <div className="inline-fields">
                        <div>
                          <label htmlFor="profileFirstName">Имя</label>
                          <input
                            id="profileFirstName"
                            value={profileFirstName}
                            onChange={(event) => setProfileFirstName(event.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor="profileLastName">Фамилия</label>
                          <input
                            id="profileLastName"
                            value={profileLastName}
                            onChange={(event) => setProfileLastName(event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="inline-fields">
                        <div>
                          <label htmlFor="profileNickname">Ник</label>
                          <input
                            id="profileNickname"
                            value={profileNickname}
                            onChange={(event) => setProfileNickname(event.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor="profileAge">Возраст</label>
                          <input
                            id="profileAge"
                            type="number"
                            min={8}
                            max={120}
                            value={profileAge}
                            onChange={(event) => setProfileAge(event.target.value)}
                          />
                        </div>
                      </div>
                      <label htmlFor="profileActivity">Сфера деятельности</label>
                      <input
                        id="profileActivity"
                        value={profileActivity}
                        onChange={(event) => setProfileActivity(event.target.value)}
                      />
                      <label htmlFor="profileAvatar">Фото (URL или data:image)</label>
                      <input
                        id="profileAvatar"
                        value={profileAvatarUrl}
                        onChange={(event) => setProfileAvatarUrl(event.target.value)}
                      />
                      <input type="file" accept="image/*" onChange={(event) => void onAvatarFileSelected(event)} />
                      <label htmlFor="profileBio">О себе</label>
                      <input id="profileBio" value={profileBio} onChange={(event) => setProfileBio(event.target.value)} />
                      <div className="inline-action-row">
                        <button type="button" className="action-btn" onClick={() => void saveProfile()} disabled={authBusy}>
                          {authBusy ? 'Сохранение...' : 'Сохранить профиль'}
                        </button>
                        <button type="button" className="outline-btn" onClick={() => void logoutProfile()}>
                          Выйти
                        </button>
                      </div>
                    </form>

                    <div className="summary-box">
                      <strong>Ачивки и прогресс</strong>
                      <p>Друзей: {profileFriendsCount}</p>
                      <div className="achievement-grid">
                        {profileAchievements.map((achievement) => renderAchievementCard(achievement))}
                        {profileAchievements.length === 0 && <p className="muted">Пока достижений нет.</p>}
                      </div>
                    </div>
                  </>
                )}
              </article>

              <aside className="panel portal-side-panel">
                <div className="panel-head">Личные матчи</div>
                <ul className="mini-list">
                  {profileGames.slice(0, 12).map((game) => (
                    <li key={`${game.id}-${game.pin}`}>
                      <span>
                        {game.theme}
                        <small className="muted"> {formatDateTime(game.finishedAt)}</small>
                      </span>
                      <button
                        type="button"
                        className="outline-btn"
                        onClick={() => {
                          setLandingPage('history')
                          void openHistoryGame(game.id)
                        }}
                      >
                        Детали
                      </button>
                    </li>
                  ))}
                  {profileGames.length === 0 && <li>После первых игр здесь появится статистика профиля.</li>}
                </ul>
              </aside>
            </section>
          )}

          {landingPage === 'community' && (
            <section className="portal-layout">
              {!authProfile && (
                <article className="panel portal-main-panel">
                  <div className="panel-head">Друзья и приглашения</div>
                  <div className="summary-box">
                    <strong>Нужна авторизация</strong>
                    <p>Войдите в аккаунт, чтобы искать друзей, отправлять заявки и приглашать в лобби.</p>
                    <button type="button" className="action-btn" onClick={() => setLandingPage('account')}>
                      Открыть страницу аккаунта
                    </button>
                  </div>
                </article>
              )}

              {authProfile && (
                <>
                  <article className="panel portal-main-panel">
                    <div className="panel-head">Поиск игроков</div>
                    <div className="inline-fields inline-fields-wide">
                      <div>
                        <label htmlFor="friendSearch">Найти друга</label>
                        <input
                          id="friendSearch"
                          className="control-input"
                          value={friendSearchQuery}
                          onChange={(event) => setFriendSearchQuery(event.target.value)}
                          placeholder="Ник, имя или логин"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void searchFriends()
                            }
                          }}
                        />
                      </div>
                      <div className="checkbox-field">
                        <label>Поиск</label>
                        <button type="button" className="action-btn" onClick={() => void searchFriends()} disabled={friendSearchBusy}>
                          {friendSearchBusy ? 'Поиск...' : 'Найти'}
                        </button>
                      </div>
                    </div>

                    <div className="summary-box">
                      <strong>Параметры приглашения</strong>
                      <div className="inline-fields">
                        <div>
                          <label htmlFor="friendInvitePin">PIN комнаты</label>
                          <input
                            id="friendInvitePin"
                            className="control-input"
                            value={friendInvitePin}
                            onChange={(event) => setFriendInvitePin(event.target.value.toUpperCase())}
                            placeholder="A1B2C3"
                          />
                        </div>
                        <div>
                          <label htmlFor="friendInviteTheme">Тема матча</label>
                          <input
                            id="friendInviteTheme"
                            className="control-input"
                            value={friendInviteTheme}
                            onChange={(event) => setFriendInviteTheme(event.target.value)}
                            placeholder={normalizedTheme}
                          />
                        </div>
                      </div>
                      <label htmlFor="friendInviteMessage">Сообщение к приглашению</label>
                      <input
                        id="friendInviteMessage"
                        className="control-input"
                        value={friendInviteMessage}
                        onChange={(event) => setFriendInviteMessage(event.target.value)}
                        placeholder="Погнали в лобби, начинаем через 2 минуты!"
                      />
                    </div>

                    <div className="friend-results-grid">
                      {friendSearchResults.map((player) => (
                        <article key={player.username} className="friend-card">
                          <button type="button" className="friend-profile-hit" onClick={() => void openPublicProfile(player.username)}>
                            {player.avatarUrl ? (
                              <img src={player.avatarUrl} alt={player.displayName} className="friend-avatar" />
                            ) : (
                              <div className="friend-avatar friend-avatar-fallback">{getInitials(player.displayName)}</div>
                            )}
                          </button>
                          <button type="button" className="friend-card-main" onClick={() => void openPublicProfile(player.username)}>
                            <strong>{player.displayName}</strong>
                            <p>@{player.username}</p>
                            <p>{friendshipStatusLabel[player.friendshipStatus]}</p>
                          </button>
                          <div className="friend-actions">
                            <button type="button" className="outline-btn" onClick={() => void openPublicProfile(player.username)}>
                              Профиль
                            </button>
                            {(player.friendshipStatus === 'none' || player.friendshipStatus === 'pending_incoming') && (
                              <button type="button" className="outline-btn" onClick={() => void requestFriend(player.username)}>
                                В друзья
                              </button>
                            )}
                            {player.friendshipStatus === 'accepted' && (
                              <>
                                <button type="button" className="outline-btn" onClick={() => void openChatWithUser(player.username)}>
                                  Сообщение
                                </button>
                                <button type="button" className="action-btn" onClick={() => void sendFriendGameInvite(player.username)}>
                                  Пригласить
                                </button>
                              </>
                            )}
                          </div>
                        </article>
                      ))}
                      {friendSearchResults.length === 0 && <p className="muted">Введите запрос и нажмите «Найти».</p>}
                    </div>

                    {publicProfileBusy && <p className="muted">Загрузка профиля...</p>}

                    <div className="summary-box chat-box">
                      <div className="chat-box-head">
                        <strong>Сообщения</strong>
                        <input
                          className="control-input"
                          value={chatSearchFilter}
                          onChange={(event) => setChatSearchFilter(event.target.value)}
                          placeholder="Фильтр диалогов"
                        />
                      </div>
                      <div className="chat-layout">
                        <aside className="chat-thread-list">
                          {chatLoading && chatThreads.length === 0 && <p className="muted">Загрузка диалогов...</p>}
                          {filteredChatThreads.map((thread) => (
                            <button
                              key={thread.threadId}
                              type="button"
                              className={clsx(
                                'chat-thread-item',
                                activeChatPeer?.username.toLowerCase() === thread.peer.username.toLowerCase() && 'chat-thread-item-active',
                              )}
                              onClick={() => void loadChatMessages(thread.peer.username)}
                            >
                              {thread.peer.avatarUrl ? (
                                <img src={thread.peer.avatarUrl} alt={thread.peer.displayName} className="friend-avatar" />
                              ) : (
                                <span className="friend-avatar friend-avatar-fallback">{getInitials(thread.peer.displayName)}</span>
                              )}
                              <span>
                                <b>{thread.peer.displayName}</b>
                                <small>
                                  {thread.lastMessage ? trimLine(thread.lastMessage.text, 56) : 'Диалог без сообщений'}
                                  {thread.unreadCount > 0 ? ` • ${thread.unreadCount} новых` : ''}
                                </small>
                              </span>
                            </button>
                          ))}
                          {!chatLoading && filteredChatThreads.length === 0 && <p className="muted">Пока нет диалогов.</p>}
                        </aside>
                        <section className="chat-dialog">
                          {!activeChatPeer && <p className="muted">Выберите друга, чтобы открыть чат.</p>}
                          {activeChatPeer && (
                            <>
                              <div className="chat-dialog-head">
                                <button type="button" className="chat-user-link" onClick={() => void openPublicProfile(activeChatPeer.username)}>
                                  {activeChatPeer.avatarUrl ? (
                                    <img src={activeChatPeer.avatarUrl} alt={activeChatPeer.displayName} className="friend-avatar" />
                                  ) : (
                                    <span className="friend-avatar friend-avatar-fallback">{getInitials(activeChatPeer.displayName)}</span>
                                  )}
                                  <span>
                                    <b>{activeChatPeer.displayName}</b>
                                    <small>@{activeChatPeer.username}</small>
                                  </span>
                                </button>
                                <button type="button" className="outline-btn" onClick={() => void sendFriendGameInvite(activeChatPeer.username)}>
                                  Инвайт
                                </button>
                              </div>
                              <div className="chat-messages">
                                {chatMessages.map((message) => (
                                  <article key={message.id} className={clsx('chat-bubble', message.fromMe ? 'chat-bubble-out' : 'chat-bubble-in')}>
                                    <p>{message.text}</p>
                                    <small>{formatDateTime(message.createdAt)}</small>
                                  </article>
                                ))}
                                {chatMessages.length === 0 && <p className="muted">Пока нет сообщений. Начните диалог.</p>}
                              </div>
                              <form className="chat-input-row" onSubmit={(event) => void sendChat(event)}>
                                <input
                                  className="control-input"
                                  value={chatDraft}
                                  onChange={(event) => setChatDraft(event.target.value)}
                                  placeholder="Написать сообщение..."
                                />
                                <button type="submit" className="action-btn" disabled={chatSending || chatDraft.trim().length === 0}>
                                  {chatSending ? 'Отправка...' : 'Отправить'}
                                </button>
                              </form>
                            </>
                          )}
                        </section>
                      </div>
                    </div>
                  </article>

                  <aside className="panel portal-side-panel">
                    <div className="panel-head">Мои связи</div>
                    <div className="summary-box">
                      <strong>Друзья</strong>
                      <ul className="mini-list">
                        {(friendOverview?.friends || []).map((friend) => (
                          <li key={`${friend.username}-${friend.requestId || friend.id}`} className="mini-user-row">
                            <button type="button" className="mini-user" onClick={() => void openPublicProfile(friend.username)}>
                              {friend.avatarUrl ? (
                                <img src={friend.avatarUrl} alt={friend.displayName} className="friend-avatar" />
                              ) : (
                                <span className="friend-avatar friend-avatar-fallback">{getInitials(friend.displayName)}</span>
                              )}
                              <span>
                                <b>{friend.displayName}</b>
                                <small>@{friend.username}</small>
                              </span>
                            </button>
                            <div className="mini-user-actions">
                              <button type="button" className="outline-btn" onClick={() => void openChatWithUser(friend.username)}>
                                Чат
                              </button>
                              <button type="button" className="outline-btn" onClick={() => void sendFriendGameInvite(friend.username)}>
                                Инвайт
                              </button>
                            </div>
                          </li>
                        ))}
                        {(friendOverview?.friends || []).length === 0 && <li>Пока нет друзей.</li>}
                      </ul>
                    </div>

                    <div className="summary-box">
                      <strong>Входящие заявки</strong>
                      <ul className="mini-list">
                        {(friendOverview?.incoming || []).map((request) => (
                          <li key={`incoming-${request.requestId}`} className="mini-user-row">
                            <button type="button" className="mini-user" onClick={() => void openPublicProfile(request.username)}>
                              {request.avatarUrl ? (
                                <img src={request.avatarUrl} alt={request.displayName} className="friend-avatar" />
                              ) : (
                                <span className="friend-avatar friend-avatar-fallback">{getInitials(request.displayName)}</span>
                              )}
                              <span>
                                <b>{request.displayName}</b>
                                <small>@{request.username}</small>
                              </span>
                            </button>
                            <div className="inline-action-row">
                              <button
                                type="button"
                                className="outline-btn"
                                onClick={() => void resolveFriendRequest(Number(request.requestId), 'accept')}
                              >
                                Принять
                              </button>
                              <button
                                type="button"
                                className="outline-btn"
                                onClick={() => void resolveFriendRequest(Number(request.requestId), 'decline')}
                              >
                                Отклонить
                              </button>
                            </div>
                          </li>
                        ))}
                        {(friendOverview?.incoming || []).length === 0 && <li>Нет новых заявок.</li>}
                      </ul>
                    </div>

                    <div className="summary-box">
                      <strong>Исходящие заявки</strong>
                      <ul className="mini-list">
                        {(friendOverview?.outgoing || []).map((request) => (
                          <li key={`outgoing-${request.requestId}`} className="mini-user-row">
                            <button type="button" className="mini-user" onClick={() => void openPublicProfile(request.username)}>
                              {request.avatarUrl ? (
                                <img src={request.avatarUrl} alt={request.displayName} className="friend-avatar" />
                              ) : (
                                <span className="friend-avatar friend-avatar-fallback">{getInitials(request.displayName)}</span>
                              )}
                              <span>
                                <b>{request.displayName}</b>
                                <small>Ожидает подтверждения</small>
                              </span>
                            </button>
                          </li>
                        ))}
                        {(friendOverview?.outgoing || []).length === 0 && <li>Нет исходящих заявок.</li>}
                      </ul>
                    </div>

                    <div className="summary-box">
                      <strong>Приглашения в игру</strong>
                      <ul className="mini-list">
                        {friendInvites.incoming.map((invite) => (
                          <li key={`invite-${invite.id}`} className="mini-user-row">
                            <button type="button" className="mini-user" onClick={() => void openPublicProfile(invite.from.username)}>
                              {invite.from.avatarUrl ? (
                                <img src={invite.from.avatarUrl} alt={invite.from.displayName} className="friend-avatar" />
                              ) : (
                                <span className="friend-avatar friend-avatar-fallback">{getInitials(invite.from.displayName)}</span>
                              )}
                              <span>
                                <b>{invite.from.displayName}</b>
                                <small>PIN: {invite.pin}</small>
                              </span>
                            </button>
                            <div className="inline-action-row">
                              <button
                                type="button"
                                className="outline-btn"
                                onClick={() => {
                                  void resolveGameInvite(invite.id, 'accept')
                                  setJoinPin(invite.pin)
                                  setMode('join')
                                  setLandingPage('play')
                                }}
                              >
                                Принять
                              </button>
                              <button type="button" className="outline-btn" onClick={() => void resolveGameInvite(invite.id, 'decline')}>
                                Отклонить
                              </button>
                            </div>
                          </li>
                        ))}
                        {friendInvites.incoming.length === 0 && <li>Нет активных приглашений.</li>}
                      </ul>
                    </div>

                    <div className="summary-box">
                      <strong>Исходящие инвайты</strong>
                      <ul className="mini-list">
                        {friendInvites.outgoing.map((invite) => (
                          <li key={`invite-out-${invite.id}`} className="mini-user-row">
                            <button type="button" className="mini-user" onClick={() => void openPublicProfile(invite.to.username)}>
                              {invite.to.avatarUrl ? (
                                <img src={invite.to.avatarUrl} alt={invite.to.displayName} className="friend-avatar" />
                              ) : (
                                <span className="friend-avatar friend-avatar-fallback">{getInitials(invite.to.displayName)}</span>
                              )}
                              <span>
                                <b>{invite.to.displayName}</b>
                                <small>
                                  PIN: {invite.pin} • {invite.status}
                                </small>
                              </span>
                            </button>
                          </li>
                        ))}
                        {friendInvites.outgoing.length === 0 && <li>Нет исходящих инвайтов.</li>}
                      </ul>
                    </div>
                  </aside>
                </>
              )}
            </section>
          )}

          {landingPage === 'leaderboard' && (
            <section className="portal-layout">
              <article className="panel portal-main-panel">
                <div className="panel-head">Топ игроков QuizBattle</div>
                <div className="leaderboard-table">
                  <div className="leaderboard-row leaderboard-row-head">
                    <span>#</span>
                    <span>Игрок</span>
                    <span>Рейтинг</span>
                    <span>Победы</span>
                    <span>Игры</span>
                    <span>Очки</span>
                  </div>
                  {leaderboard.map((item, index) => (
                    <button
                      key={`${item.username}-${index}`}
                      type="button"
                      className={clsx(
                        'leaderboard-row',
                        'leaderboard-row-action',
                        authProfile && item.username.toLowerCase() === authProfile.username.toLowerCase() && 'leaderboard-row-me',
                      )}
                      onClick={() => void openPublicProfile(item.username)}
                    >
                      <span>{index + 1}</span>
                      <span className="leaderboard-player-cell">
                        {item.avatarUrl ? (
                          <img src={item.avatarUrl} alt={item.displayName} className="leaderboard-avatar" />
                        ) : (
                          <span className="leaderboard-avatar leaderboard-avatar-fallback">{getInitials(item.displayName || item.username)}</span>
                        )}
                        <b>{item.displayName || item.username}</b>
                      </span>
                      <span>{item.rating}</span>
                      <span>{item.wins}</span>
                      <span>{item.gamesPlayed}</span>
                      <span>{item.totalPoints}</span>
                    </button>
                  ))}
                  {leaderboard.length === 0 && <p className="muted">Рейтинг пока пуст.</p>}
                </div>
              </article>

              <aside className="panel portal-side-panel">
                <div className="panel-head">Мой прогресс</div>
                <div className="summary-box">
                  {authProfile ? (
                    <>
                      <strong>{authProfile.displayName}</strong>
                      <p>Позиция в рейтинге: {myLeaderboardPosition > 0 ? `#${myLeaderboardPosition}` : 'еще нет в топе'}</p>
                      <p>Рейтинг: {authProfile.rating}</p>
                      <p>Победы: {authProfile.wins}</p>
                      <p>Игр сыграно: {authProfile.gamesPlayed}</p>
                      <button type="button" className="outline-btn" onClick={() => setLandingPage('account')}>
                        Открыть профиль
                      </button>
                    </>
                  ) : (
                    <>
                      <strong>Войдите в аккаунт</strong>
                      <p>После входа здесь появится ваша позиция в таблице.</p>
                      <button type="button" className="outline-btn" onClick={() => setLandingPage('account')}>
                        Перейти к входу
                      </button>
                    </>
                  )}
                </div>
              </aside>
            </section>
          )}

          {landingPage === 'history' && (
            <section className="portal-layout">
              <article className="panel portal-main-panel">
                <div className="panel-head">Последние матчи</div>
                <div className="history-grid">
                  {recentGames.map((item) => (
                    <article key={item.id} className="history-card">
                      <div>
                        <strong>{item.theme}</strong>
                        <p>
                          PIN: {item.pin} • {formatDateTime(item.finishedAt)}
                        </p>
                        <p>
                          Формат: {item.format === 'ffa' ? 'FFA' : 'Команды'} • Участники: {item.participants}
                        </p>
                        <p>
                          Итог: {item.format === 'ffa' ? item.winner : `${item.scoreA}:${item.scoreB}`}
                        </p>
                      </div>
                      <button type="button" className="outline-btn" onClick={() => void openHistoryGame(item.id)} disabled={historyBusy}>
                        Открыть матч
                      </button>
                    </article>
                  ))}
                  {recentGames.length === 0 && <p className="muted">История пока пустая.</p>}
                </div>
              </article>

              <aside className="panel portal-side-panel">
                <div className="panel-head">Детали матча</div>
                {!selectedHistoryGame && <p className="muted">Выберите матч из списка, чтобы увидеть подробную статистику и сертификат.</p>}
                {selectedHistoryGame && (
                  <div className="summary-box">
                    <strong>{selectedHistoryGame.game.theme}</strong>
                    <p>
                      PIN: {selectedHistoryGame.game.pin} • {formatDateTime(selectedHistoryGame.game.finishedAt)}
                    </p>
                    <p>
                      Формат: {selectedHistoryGame.game.format === 'ffa' ? 'FFA' : 'Командный'} • Победитель:{' '}
                      {selectedHistoryGame.game.winner || '—'}
                    </p>
                    {selectedHistoryGame.game.format === 'teams' && (
                      <p>
                        Счет: {selectedHistoryGame.game.scoreA}:{selectedHistoryGame.game.scoreB}
                      </p>
                    )}

                    <div className="summary-box">
                      <strong>Игроки матча</strong>
                      <ul className="mini-list">
                        {selectedHistoryGame.players.map((player) => (
                          <li key={`${player.username}-${player.team}`} className="mini-user-row">
                            <button type="button" className="mini-user" onClick={() => void openPublicProfile(player.username)}>
                              {player.avatarUrl ? (
                                <img
                                  src={player.avatarUrl}
                                  alt={player.displayName || player.username}
                                  className="friend-avatar"
                                />
                              ) : (
                                <span className="friend-avatar friend-avatar-fallback">
                                  {getInitials(player.displayName || player.username)}
                                </span>
                              )}
                              <span>
                                <b>{player.displayName || player.username}</b>
                                <small>{player.team || 'FFA'}</small>
                              </span>
                            </button>
                            <b>
                              {player.points} очк. • {player.accuracy}%
                            </b>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button type="button" className="action-btn" onClick={() => void downloadHistoryCertificate()}>
                      Скачать сертификат матча
                    </button>

                    <div className="summary-box">
                      <strong>Разбор вопросов</strong>
                      <ul className="mini-list">
                        {(selectedHistoryGame.summary?.roundHistory || []).slice(0, 16).map((entry, index) => (
                          <li key={`history-round-${index}`}>
                            <span>
                              {index + 1}. {entry.question || 'Вопрос без текста'}
                              <small className="muted"> Верно: {entry.correctOption || '—'}</small>
                            </span>
                          </li>
                        ))}
                        {(selectedHistoryGame.summary?.roundHistory || []).length === 0 && (
                          <li>Для старых матчей подробный разбор может отсутствовать.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </aside>
            </section>
          )}
        </div>

        {notice && <div className="notice">{notice}</div>}
        {publicProfileModalOpen && (
          <div
            className="profile-modal-overlay"
            role="presentation"
            onClick={() => {
              setPublicProfileModalOpen(false)
            }}
          >
            <section
              className="profile-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Публичный профиль игрока"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="profile-modal-head">
                <h3>{publicProfileCard ? `Профиль: ${publicProfileCard.profile.displayName}` : 'Публичный профиль'}</h3>
                <button type="button" className="outline-btn" onClick={() => setPublicProfileModalOpen(false)}>
                  Закрыть
                </button>
              </div>
              {publicProfileBusy && <p className="muted">Загрузка профиля...</p>}
              {!publicProfileBusy && !publicProfileCard && <p className="muted">Профиль недоступен.</p>}
              {publicProfileCard && (
                <>
                  <div className="profile-modal-hero">
                    {publicProfileCard.profile.avatarUrl ? (
                      <img src={publicProfileCard.profile.avatarUrl} alt={publicProfileCard.profile.displayName} className="profile-avatar" />
                    ) : (
                      <span className="profile-avatar profile-avatar-fallback">{getInitials(publicProfileCard.profile.displayName)}</span>
                    )}
                    <div>
                      <strong>{publicProfileCard.profile.displayName}</strong>
                      <p>
                        @{publicProfileCard.profile.username} • друзей {publicProfileCard.social.friendsCount}
                      </p>
                      <p>
                        Рейтинг: {publicProfileCard.profile.rating} • Победы: {publicProfileCard.profile.wins} • Матчи:{' '}
                        {publicProfileCard.profile.gamesPlayed}
                      </p>
                      <p>
                        Сфера: {publicProfileCard.profile.activity || '—'} • Возраст: {publicProfileCard.profile.age || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="profile-modal-actions">
                    {publicProfileCard.friendshipStatus === 'self' && (
                      <button
                        type="button"
                        className="outline-btn"
                        onClick={() => {
                          setPublicProfileModalOpen(false)
                          setLandingPage('account')
                        }}
                      >
                        Открыть мой аккаунт
                      </button>
                    )}
                    {(publicProfileCard.friendshipStatus === 'none' || publicProfileCard.friendshipStatus === 'pending_incoming') && (
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => void requestFriend(publicProfileCard.profile.username)}
                        disabled={!authToken}
                      >
                        {authToken ? 'Добавить в друзья' : 'Войдите для добавления'}
                      </button>
                    )}
                    {publicProfileCard.friendshipStatus === 'accepted' && (
                      <>
                        <button type="button" className="action-btn" onClick={() => void openChatWithUser(publicProfileCard.profile.username)}>
                          Написать сообщение
                        </button>
                        <button type="button" className="outline-btn" onClick={() => void sendFriendGameInvite(publicProfileCard.profile.username)}>
                          Пригласить в игру
                        </button>
                      </>
                    )}
                  </div>

                  <div className="summary-box">
                    <strong>Достижения</strong>
                    <div className="achievement-grid">
                      {publicProfileCard.achievements.map((achievement) => renderAchievementCard(achievement))}
                    </div>
                  </div>

                  <div className="summary-box">
                    <strong>Последние игры</strong>
                    <ul className="mini-list">
                      {publicProfileCard.games.slice(0, 8).map((game) => (
                        <li key={`public-profile-game-${game.id}-${game.pin}`}>
                          <span>
                            {game.theme}
                            <small className="muted"> {formatDateTime(game.finishedAt)}</small>
                          </span>
                          <button
                            type="button"
                            className="outline-btn"
                            onClick={() => {
                              setPublicProfileModalOpen(false)
                              setLandingPage('history')
                              void openHistoryGame(game.id)
                            }}
                          >
                            Детали
                          </button>
                        </li>
                      ))}
                      {publicProfileCard.games.length === 0 && <li>История матчей пока пустая.</li>}
                    </ul>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
        {openedGameplayMode && (
          <div className="mode-modal-overlay" role="presentation" onClick={() => setModeInfoOpen(null)}>
            <section
              className="mode-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Описание режима ${openedGameplayMode.title}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mode-modal-head">
                <h3>
                  {openedGameplayMode.icon} {openedGameplayMode.title}
                </h3>
                <button type="button" className="outline-btn" onClick={() => setModeInfoOpen(null)}>
                  Закрыть
                </button>
              </div>
              <p className="mode-modal-format">
                Формат:{' '}
                {openedGameplayMode.id === 'duel_1v1'
                  ? 'Один игрок в Команде A против одного игрока в Команде B'
                  : openedGameplayMode.format === 'ffa'
                    ? 'Каждый сам за себя'
                    : 'Команда A против Команды B'}
              </p>
              <p className="mode-modal-tagline">{openedGameplayMode.tagline}</p>
              <div className="mode-modal-rules">
                {openedGameplayMode.rules.map((rule) => (
                  <p key={rule}>{rule}</p>
                ))}
              </div>
              <button
                type="button"
                className="action-btn"
                onClick={() => {
                  setGameMode(openedGameplayMode.id)
                  setModeInfoOpen(null)
                }}
              >
                Выбрать этот режим
              </button>
            </section>
          </div>
        )}
      </div>
    )
  }

  const providerLabel = roomState.providerLabel || roomState.provider
  const totalPlayers = roomState.participants.filter((participant) => participant.team !== 'HOST').length
  const plannedRounds = roomState.format === 'ffa' ? roomState.questionCount * Math.max(totalPlayers, 1) : roomState.questionCount * 2
  const liveReviewPresentation = getReviewPresentation(activeRound?.currentSubmission)
  const finalRoundsLine = `Раундов сыграно: ${finalSummary.totalRounds} из ${finalSummary.expectedRounds || plannedRounds}`
  const finalParticipantsLine =
    roomState.format === 'teams'
      ? `Команда A (${finalSummary.rosterA.length}): ${formatRoster(finalSummary.rosterA, 4)} • Команда B (${finalSummary.rosterB.length}): ${formatRoster(finalSummary.rosterB, 4)}`
      : `Участники (${finalSummary.participantCount}): ${formatRoster(
          roomState.playerStats.filter((item) => item.team === 'A' || item.team === 'B').map((item) => item.name),
          8,
        )}`
  const finalMvpLine = finalSummary.bestPlayer
    ? `MVP: ${finalSummary.bestPlayer.name} • ${finalSummary.bestPlayer.points} очк. • ${finalSummary.bestPlayer.accuracy}%`
    : 'MVP: определяется по личной статистике игроков'

  return (
    <div className={clsx('site-shell', uiTheme === 'dark' && 'theme-dark')}>
      <div className="app-frame">
        <header className="topbar">
          <div className="brand-lockup">
            <span className="brand-mark">Q</span>
            <div className="brand-copy">
              <strong>QuizBattle Room</strong>
              <span>PIN {roomState.pin}</span>
            </div>
          </div>

          <div className="topbar-actions">
            <span className="top-pill">Игроков: {totalPlayers}</span>
            <span className="top-pill">Источник: {providerLabel}</span>
            <span className="top-pill">Аудитория: {roomState.audience.label}</span>
            <span className="top-pill">{roomState.format === 'ffa' ? 'FFA' : 'Команды A/B'}</span>
            <div className="quick-toggles">
              <button
                type="button"
                className={clsx('toggle-chip', uiTheme === 'dark' && 'toggle-chip-active')}
                onClick={() => setUiTheme((current) => (current === 'light' ? 'dark' : 'light'))}
              >
                {uiTheme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
              </button>
              <button
                type="button"
                className={clsx('toggle-chip', soundEnabled && 'toggle-chip-active')}
                onClick={() => setSoundEnabled((current) => !current)}
              >
                {soundEnabled ? 'Звук: On' : 'Звук: Off'}
              </button>
            </div>
            <div className="status-chip">
              <span className={connected ? 'dot connected' : 'dot'} />
              {connected ? 'Сервер онлайн' : 'Сервер недоступен'}
            </div>
          </div>
        </header>

        <section className="hero-card hero-card-battle">
          <div className="hero-content">
            <p className="kicker">Текущий матч</p>
            <h1>{roomState.theme}</h1>
            <p className="hero-subtitle">
              Раундовая игра с командным счетом, живой тайм-линией и подробным разбором сложных вопросов.
            </p>
              <div className="hero-tags">
                <span className="hero-tag">Статус: {roomState.status}</span>
                <span className="hero-tag">Раундов: {plannedRounds}</span>
                <span className="hero-tag">Таймер: {roomState.timerSeconds} сек</span>
                <span className="hero-tag">AI режим: серверный</span>
                <span className="hero-tag">Режим: {roomState.gameMode?.label || 'Командная дуэль'}</span>
                <span className="hero-tag">
                  Формат:{' '}
                  {roomState.gameMode?.key === 'duel_1v1'
                    ? 'Дуэль 1v1'
                    : roomState.format === 'ffa'
                      ? 'Все против всех'
                      : 'Команды A/B'}
                </span>
                <span className="hero-tag">Стиль: {roomState.tone.label}</span>
                <span className="hero-tag">Сложность: {difficultyModeLabel[roomState.difficultyMode]}</span>
                {roomState.speedBonusEnabled && <span className="hero-tag">Speed bonus: ON</span>}
                {roomState.hasPassword && <span className="hero-tag">Комната с паролем</span>}
                {roomModeLabels.length > 0 && <span className="hero-tag">Режимы: {roomModeLabels.join(', ')}</span>}
                {!roomState.hostOnline && <span className="hero-tag">Ведущий переподключается...</span>}
                {roomState.lastExport && <span className="hero-tag">Отчет: {roomState.lastExport.fileName}</span>}
            </div>
          </div>

          <div className="battle-actions">
            <button type="button" className="ghost-btn" onClick={() => void copyInviteLink()}>
              Скопировать ссылку-приглашение
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => void shareMatchResult()}
              disabled={roomState.status !== 'finished'}
            >
              Поделиться итогом
            </button>
            {isHost && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => void exportResults()}
                disabled={roomState.status !== 'finished'}
              >
                Экспорт результата
              </button>
            )}
            <button type="button" className="ghost-btn" onClick={() => void leaveRoom()}>
              Выйти из комнаты
            </button>
          </div>
        </section>

        <main className="battle-layout">
          <aside className="panel team-panel">
            <div className="panel-head">{isFfa ? 'Игроки и рейтинг' : 'Команды и счет'}</div>

            {isFfa ? (
              <div className="team-card team-a">
                <div className="team-card-head">
                  <strong>🏁 Лидерборд FFA</strong>
                </div>
                <ul>
                  {roomState.ffaLeaderboard.map((player, index) => (
                    <li key={player.id}>
                      <span className="avatar-pill">{index + 1}</span>
                      <span className="list-grow">{player.name}</span>
                      <strong>{player.points}</strong>
                    </li>
                  ))}
                  {roomState.ffaLeaderboard.length === 0 && <li className="muted">Нет игроков</li>}
                </ul>
              </div>
            ) : (
              <>
                {(['A', 'B'] as TeamId[]).map((teamKey) => (
                  <div key={teamKey} className={clsx('team-card', teamKey === 'A' ? 'team-a' : 'team-b')}>
                    <div className="team-card-head">
                      <strong>
                        {teamEmoji[teamKey]} {teamTitle[teamKey]}
                      </strong>
                      <span>{roomState.scores[teamKey]}</span>
                    </div>
                    <ul>
                      {teamMembers[teamKey].map((member) => (
                        <li key={member.id}>
                          <span className="avatar-pill">{getInitials(member.name)}</span>
                          <span className="list-grow">{member.name}</span>
                        </li>
                      ))}
                      {teamMembers[teamKey].length === 0 && <li className="muted">Нет игроков</li>}
                    </ul>
                  </div>
                ))}
              </>
            )}

            {teamMembers.HOST.length > 0 && (
              <div className="host-card">Ведущий: {teamMembers.HOST.map((member) => member.name).join(', ')}</div>
            )}

            {canSwitchTeam && (
              <div className="team-switcher-card">
                <strong>Текущая команда: {me?.team === 'A' ? 'Команда A' : 'Команда B'}</strong>
                <div className="team-switcher-actions">
                  <button
                    type="button"
                    className={clsx('outline-btn', me?.team === 'A' && 'team-switch-active')}
                    onClick={() => void switchTeam('A')}
                    disabled={me?.team === 'A'}
                  >
                    Перейти в A
                  </button>
                  <button
                    type="button"
                    className={clsx('outline-btn', me?.team === 'B' && 'team-switch-active')}
                    onClick={() => void switchTeam('B')}
                    disabled={me?.team === 'B'}
                  >
                    Перейти в B
                  </button>
                </div>
              </div>
            )}

            {isHost && roomState.status !== 'finished' && (
              <div className="host-admin-actions">
                {(roomState.status === 'running' || roomState.status === 'paused') && (
                  <button type="button" className="action-btn" onClick={() => void togglePause()}>
                    {roomState.status === 'paused' ? 'Продолжить игру' : 'Пауза'}
                  </button>
                )}
                {(roomState.status === 'running' || roomState.status === 'paused') && (
                  <>
                    <button type="button" className="outline-btn" onClick={() => void skipRound()}>
                      Пропустить вопрос
                    </button>
                    <button type="button" className="outline-btn" onClick={() => void nextRound()}>
                      Следующий вопрос
                    </button>
                  </>
                )}
              </div>
            )}

            {isHost && roomState.status !== 'finished' && (
              <div className="player-control-list">
                <strong>Дисквалификация</strong>
                <ul>
                  {roomState.participants
                    .filter((participant) => !participant.isHost)
                    .map((participant) => (
                      <li key={participant.id}>
                        <span>{participant.name}</span>
                        <button
                          type="button"
                          className="kick-btn"
                          onClick={() => void kickPlayer(participant.id, participant.name)}
                        >
                          Удалить
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </aside>

          <section className="panel stage-panel">
            <div className="panel-head">Игровой раунд</div>

            {roomState.status === 'lobby' && (
              <div className="state-card">
                <h2>Лобби готово</h2>
                <div className="lobby-pin">{roomState.pin}</div>
                <p>Игроков: {roomState.participants.length - 1}</p>
                {roomState.format === 'teams' ? (
                  <div className="lobby-preview-grid">
                    <div className="lobby-preview-team">
                      <strong>Команда A</strong>
                      <ul>
                        {teamMembers.A.length === 0 && <li className="muted">Пока пусто</li>}
                        {teamMembers.A.map((member) => (
                          <li key={member.id}>{member.name}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="lobby-preview-team">
                      <strong>Команда B</strong>
                      <ul>
                        {teamMembers.B.length === 0 && <li className="muted">Пока пусто</li>}
                        {teamMembers.B.map((member) => (
                          <li key={member.id}>{member.name}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="lobby-preview-team">
                    <strong>Участники FFA</strong>
                    <ul>
                      {roomState.participants
                        .filter((participant) => !participant.isHost)
                        .map((participant) => (
                          <li key={participant.id}>{participant.name}</li>
                        ))}
                    </ul>
                  </div>
                )}
                {isHost ? (
                  <button type="button" className="action-btn" onClick={() => void startGame()}>
                    Запустить игру
                  </button>
                ) : (
                  <p className="muted">Ждем запуска от ведущего...</p>
                )}
              </div>
            )}

            {roomState.status === 'preparing' && (
              <div className="state-card state-card-info">
                <h2>Генерация вопросов</h2>
                <p>
                  Подготовлено {roomState.generation.ready} из {roomState.generation.total}. Готовим полный пакет
                  вопросов перед стартом матча.
                </p>
                {roomState.generation.error ? (
                  <p className="muted">Есть временная ошибка генерации: {roomState.generation.error}</p>
                ) : null}
              </div>
            )}

            {(roomState.status === 'running' || roomState.status === 'paused') && activeRound && (
              <>
                <div className="round-top">
                  <span className="chip">
                    Раунд {activeRound.roundNumber}/{activeRound.totalRounds}
                  </span>
                  <span className="chip">Ход: {activeTurnLabel}</span>
                  <span className={clsx('chip', roomState.status === 'paused' && 'chip-paused')}>
                    {roomState.status === 'paused' ? 'Пауза' : formatMs(syncedTimeLeft)}
                  </span>
                  <span className="chip">
                    {activeRound.question ? difficultyLabel[activeRound.question.difficulty] : 'Spectator'}
                  </span>
                  {roomState.format === 'teams' && teamVoting && (
                    <span className="chip">
                      Голоса: {teamVoting.submitted}/{teamVoting.total}
                    </span>
                  )}
                  {roomState.format === 'teams' && myVoteIndex !== null && (
                    <span className="chip">Ваш голос: {answerGlyph[myVoteIndex]}</span>
                  )}
                  {roomState.format === 'teams' && myPassed && <span className="chip">Ваш голос: Пас</span>}
                </div>

                <div className="timer-line" role="presentation">
                  <span style={{ width: `${timerProgress}%` }} />
                </div>

                <div className="question-card">
                  <h2>
                    {activeRound.question?.text ||
                      (roomState.format === 'ffa' ? 'Сейчас отвечает другой игрок' : 'Сейчас отвечает другая команда')}
                  </h2>
                  {activeRound.question?.image?.url && (
                    <figure className="question-image-frame">
                      <img
                        src={activeRound.question.image.url}
                        alt={activeRound.question.text}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    </figure>
                  )}
                </div>

                {activeRound.question?.options ? (
                  <>
                    <div className="options-grid">
                      {activeRound.question.options.map((option, index) => (
                        <button
                          type="button"
                          key={`${activeRound.key}-${index}`}
                          className={clsx(
                            'option-btn',
                            !activeRound.locked && myVoteIndex === index && 'option-voted',
                            activeRound.locked && activeRound.currentSubmission?.answerIndex === index && 'option-picked',
                            activeRound.locked && activeRound.currentSubmission?.expectedCorrectIndex === index && 'option-correct',
                          )}
                          onClick={() => void submitAnswer(index)}
                          disabled={!activeRound.canAnswer || activeRound.locked || submitting || roomState.status === 'paused'}
                        >
                          <strong>{answerGlyph[index]}</strong>
                          <span>{option}</span>
                        </button>
                      ))}
                    </div>
                    {roomState.format === 'teams' && (
                      <div className="team-vote-actions">
                        {roomState.rules?.passEnabled ? (
                          <button
                            type="button"
                            className={clsx('outline-btn', 'pass-vote-btn', !activeRound.locked && myPassed && 'pass-vote-btn-active')}
                            onClick={() => void submitPass()}
                            disabled={!activeRound.canAnswer || activeRound.locked || submitting || roomState.status === 'paused'}
                          >
                            Пас
                          </button>
                        ) : (
                          <span className="chip">Пас отключен в режиме {roomState.gameMode?.label}</span>
                        )}
                        <p className="muted">Ответ команды фиксируется по большинству голосов участников.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="spectator-box">
                    {roomState.format === 'ffa'
                      ? 'Сейчас ход другого игрока. Следи за раундом.'
                      : 'Смотри раунд соперников. Твой ход скоро.'}
                  </div>
                )}

                {activeRound.currentSubmission && (
                  <div className={clsx('submission-box', activeRound.currentSubmission.correct ? 'ok' : 'fail')}>
                    {activeRound.currentSubmission.type === 'timeout' ? (
                      <p>
                        {roomState.format === 'ffa'
                          ? 'Время вышло, игрок не отправил ответ.'
                          : 'Время вышло, команда не отправила ответ.'}
                      </p>
                    ) : activeRound.currentSubmission.type === 'skip' ? (
                      <p>Ведущий пропустил текущий вопрос.</p>
                    ) : activeRound.currentSubmission.type === 'pass' ? (
                      <p>{activeRound.currentSubmission.byName} выбрал(а) пас.</p>
                    ) : activeRound.currentSubmission.correct ? (
                      <p>{activeRound.currentSubmission.byName} получает +{activeRound.currentSubmission.points} очков.</p>
                    ) : (
                      <p>{activeRound.currentSubmission.byName} ошибся(лась).</p>
                    )}
                  </div>
                )}

                {roomState.lastRoundSummary && activeRound.currentSubmission && (
                  <div className={clsx('round-review-card', liveReviewPresentation.toneClass)}>
                    <div className="round-review-head">
                      <span className="round-review-icon" aria-hidden="true">
                        {liveReviewPresentation.icon}
                      </span>
                      <h3>Разбор вопроса</h3>
                      <span className="round-review-badge">{liveReviewPresentation.label}</span>
                    </div>
                    {roomState.lastRoundSummary.playerName && (
                      <p className="round-review-meta">Ход игрока: {roomState.lastRoundSummary.playerName}</p>
                    )}
                    <p className="round-review-question">{roomState.lastRoundSummary.question}</p>
                    {roomState.lastRoundSummary.image?.url && (
                      <figure className="round-review-image-frame">
                        <img
                          src={roomState.lastRoundSummary.image.url}
                          alt={roomState.lastRoundSummary.question}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      </figure>
                    )}
                    <p className="round-review-answer">
                      Верный ответ: <b>{roomState.lastRoundSummary.correctOption}</b>
                    </p>
                    <p className="round-review-explanation">{roomState.lastRoundSummary.explanation}</p>
                  </div>
                )}
              </>
            )}

            {roomState.status === 'finished' && (
              <div className="state-card state-card-final">
                <h2>{roomState.resultHeadline}</h2>
                {roomState.format === 'teams' ? (
                  <p>
                    Итог: {roomState.scores.A} : {roomState.scores.B}
                  </p>
                ) : (
                  <p>Игра завершена. Персональный рейтинг и аналитика доступны сразу в этом отчете.</p>
                )}
                <div className="final-stats-grid">
                  <article className="final-stat-card">
                    <span>Раунды</span>
                    <b>{finalSummary.totalRounds}</b>
                    <small>из {finalSummary.expectedRounds || plannedRounds}</small>
                  </article>
                  <article className="final-stat-card">
                    <span>Точность</span>
                    <b>{finalSummary.accuracy}%</b>
                    <small>{finalSummary.correctRounds} верных раундов</small>
                  </article>
                  <article className="final-stat-card">
                    <span>Средний ответ</span>
                    <b>{finalSummary.avgResponseSeconds.toFixed(1)}с</b>
                    <small>по раундам с выбранным вариантом</small>
                  </article>
                  <article className="final-stat-card">
                    <span>Потери раундов</span>
                    <b>{finalSummary.timeoutRounds + finalSummary.passRounds + finalSummary.skippedRounds}</b>
                    <small>
                      таймауты {finalSummary.timeoutRounds} • пасы {finalSummary.passRounds} • пропуски{' '}
                      {finalSummary.skippedRounds}
                    </small>
                  </article>
                  <article className="final-stat-card">
                    <span>Лучший результат</span>
                    <b>{finalSummary.bestPlayer?.name || '—'}</b>
                    <small>
                      {finalSummary.bestPlayer
                        ? `${finalSummary.bestPlayer.points} очк. • ${finalSummary.bestPlayer.accuracy}% точность`
                        : 'Ожидаем статистику игроков'}
                    </small>
                  </article>
                </div>
                <div className="certificate-preview-card">
                  <div className="certificate-preview-ribbon">Официальный сертификат</div>
                  <h3>QuizBattle Achievement</h3>
                  <p className="certificate-preview-line">{roomState.resultHeadline}</p>
                  <p className="certificate-preview-line">Тема: {roomState.theme}</p>
                  <p className="certificate-preview-line">
                    {roomState.format === 'teams'
                      ? `Счет матча: A ${roomState.scores.A} : B ${roomState.scores.B}`
                      : roomState.ffaLeaderboard.length > 0
                        ? `Победитель: ${roomState.ffaLeaderboard[0].name} (${roomState.ffaLeaderboard[0].points} очк.)`
                        : 'Матч завершен'}
                  </p>
                  <p className="certificate-preview-line">{finalRoundsLine}</p>
                  <p className="certificate-preview-line">
                    Режим матча: {roomState.gameMode?.label || 'Командная дуэль'}
                  </p>
                  <p className="certificate-preview-line">
                    Пакеты: {roomModeLabels.length > 0 ? roomModeLabels.join(' • ') : 'Смешанный'}
                  </p>
                  <p className="certificate-preview-line">{finalParticipantsLine}</p>
                  <p className="certificate-preview-line">{finalMvpLine}</p>
                  <button type="button" className="action-btn" onClick={() => void downloadCertificate()}>
                    Скачать сертификат
                  </button>
                </div>
                {isHost && (
                  <button type="button" className="action-btn" onClick={() => void startGame()}>
                    Реванш
                  </button>
                )}
                {roundHistory.length > 0 && selectedHistoryEntry && (
                  <div className="round-history-card">
                    <div className="round-history-head">
                      <h3>Разбор всех вопросов</h3>
                      <div className="round-history-controls">
                        <button
                          type="button"
                          className="outline-btn"
                          onClick={() => setFinalHistoryIndex((current) => Math.max(0, current - 1))}
                          disabled={safeFinalHistoryIndex <= 0}
                        >
                          Назад
                        </button>
                        <span className="round-history-counter">
                          Раунд {safeFinalHistoryIndex + 1}/{roundHistory.length}
                        </span>
                        <button
                          type="button"
                          className="outline-btn"
                          onClick={() => setFinalHistoryIndex((current) => Math.min(roundHistory.length - 1, current + 1))}
                          disabled={safeFinalHistoryIndex >= roundHistory.length - 1}
                        >
                          Далее
                        </button>
                      </div>
                    </div>

                    <div className="round-history-strip">
                      {roundHistory.map((entry, index) => (
                        <button
                          type="button"
                          key={entry.id}
                          className={clsx('round-history-chip', index === safeFinalHistoryIndex && 'round-history-chip-active')}
                          onClick={() => setFinalHistoryIndex(index)}
                        >
                          {entry.roundNumber}
                        </button>
                      ))}
                    </div>

                    <div className={clsx('round-review-card', 'round-review-card-final', selectedHistoryPresentation.toneClass)}>
                      <div className="round-review-head">
                        <span className="round-review-icon" aria-hidden="true">
                          {selectedHistoryPresentation.icon}
                        </span>
                        <h3>Раунд {selectedHistoryEntry.roundNumber}</h3>
                        <span className="round-review-badge">{selectedHistoryPresentation.label}</span>
                      </div>
                      <p className="round-review-meta">
                        {roomState.format === 'ffa'
                          ? `Игрок: ${selectedHistoryEntry.playerName || 'Игрок'}`
                          : `Ход: ${teamTitle[selectedHistoryEntry.team]}`}{' '}
                        • Сложность: {difficultyLabel[selectedHistoryEntry.difficulty]}
                      </p>
                      <p className="round-review-meta">{formatRoundOutcome(selectedHistoryEntry.submission, roomState.format)}</p>
                      <p className="round-review-question">{selectedHistoryEntry.question}</p>
                      {selectedHistoryEntry.image?.url && (
                        <figure className="round-review-image-frame">
                          <img
                            src={selectedHistoryEntry.image.url}
                            alt={selectedHistoryEntry.question}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        </figure>
                      )}
                      <div className="round-history-options">
                        {selectedHistoryEntry.options.map((option, optionIndex) => (
                          <div
                            key={`${selectedHistoryEntry.id}-${optionIndex}`}
                            className={clsx(
                              'round-history-option',
                              optionIndex === selectedHistoryEntry.correctIndex && 'round-history-option-correct',
                              selectedHistoryEntry.submission.answerIndex === optionIndex && 'round-history-option-picked',
                              selectedHistoryEntry.submission.answerIndex === optionIndex &&
                                optionIndex !== selectedHistoryEntry.correctIndex &&
                                'round-history-option-wrong',
                            )}
                          >
                            <strong>{answerGlyph[optionIndex]}</strong>
                            <span>{option}</span>
                          </div>
                        ))}
                      </div>
                      <p className="round-review-answer">
                        Верный ответ: <b>{selectedHistoryEntry.correctOption}</b>
                      </p>
                      <p className="round-review-explanation">{selectedHistoryEntry.explanation}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="panel feed-panel">
            <div className="panel-head">Лента и аналитика</div>

            <div className="feed-box">
              <strong>События матча</strong>
              <ul>
                {roomState.timeline.length === 0 && <li>События появятся после старта игры</li>}
                {roomState.timeline.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>

            {roomState.status === 'finished' && (
              <>
                <div className="hard-box">
                  <strong>Сложные вопросы</strong>
                  <ul>
                    {roomState.hardestQuestions.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        [{item.team}] {item.wrong + item.timeouts} ошибок
                      </li>
                    ))}
                    {roomState.hardestQuestions.length === 0 && <li>Пока нет аналитики</li>}
                  </ul>
                </div>

                {roomState.format === 'teams' ? (
                  <div className="hard-box">
                    <strong>Командная дисциплина</strong>
                    <ul>
                      <li>
                        Команда A: таймауты {roomState.teamMetrics.A.timeouts}, пропуски {roomState.teamMetrics.A.skips}
                      </li>
                      <li>
                        Команда B: таймауты {roomState.teamMetrics.B.timeouts}, пропуски {roomState.teamMetrics.B.skips}
                      </li>
                    </ul>
                  </div>
                ) : (
                  <div className="hard-box">
                    <strong>Итоговый FFA-рейтинг</strong>
                    <ul>
                      {roomState.ffaLeaderboard.map((item, index) => (
                        <li key={item.id}>
                          {index + 1}. {item.name}: {item.points} очк.
                        </li>
                      ))}
                      {roomState.ffaLeaderboard.length === 0 && <li>Пока нет данных</li>}
                    </ul>
                  </div>
                )}

                <div className="player-stats-card">
                  <strong>Статистика игроков</strong>
                  <div className="player-stats-grid">
                    {roomState.playerStats
                      .filter((item) => item.team === 'A' || item.team === 'B')
                      .map((item) => (
                        <article key={item.id} className="player-stat-row">
                          <div>
                            <b>{item.name}</b>
                            <p>
                              {roomState.format === 'teams' ? `Команда ${item.team}` : 'FFA'}{' '}
                              {item.disqualified
                                ? '• дисквалифицирован'
                                : item.connected
                                  ? '• онлайн'
                                  : '• вышел'}
                            </p>
                          </div>
                          <div className="player-stat-kpi">
                            <span>{item.points} очк.</span>
                            <small>
                              {item.correct}/{item.answers} ({item.accuracy}%)
                            </small>
                          </div>
                        </article>
                      ))}
                  </div>
                </div>
              </>
            )}

            {roomState.lastExport && (
              <div className="summary-box">
                <strong>Последний экспорт</strong>
                <p>{roomState.lastExport.fileName}</p>
                <p className="summary-note">{roomState.lastExport.filePath}</p>
              </div>
            )}
          </aside>
        </main>
      </div>

      {notice && <div className="notice">{notice}</div>}
    </div>
  )
}

export default App
