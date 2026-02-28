const path = require('path')
const fs = require('fs/promises')
const crypto = require('crypto')
const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')
require('dotenv').config()

const { generateQuizQuestions } = require('./questionGenerator')
const {
  ensureDb,
  registerUser,
  loginUser,
  logoutSession,
  getAuthProfile,
  updateProfileByToken,
  searchUsers,
  sendFriendRequest,
  respondFriendRequest,
  getFriendsOverview,
  sendGameInvite,
  getGameInvites,
  respondGameInvite,
  getChatList,
  getChatMessages,
  sendChatMessage,
  getLeaderboard,
  getRecentGames,
  getGameDetails,
  getProfileWithGames,
  persistFinishedGame,
} = require('./database')

const app = express()
app.use(cors())
app.use(express.json())

let persistenceEnabled = true
try {
  ensureDb()
} catch (error) {
  persistenceEnabled = false
  console.error('Persistence is disabled: database init failed.', error)
}

const parseLimit = (value, fallback) => {
  const raw = Number(value)
  if (!Number.isInteger(raw)) return fallback
  return Math.min(100, Math.max(1, raw))
}

const ensurePersistence = (res) => {
  if (persistenceEnabled) return true
  res.status(503).json({ ok: false, error: 'Хранилище временно недоступно.' })
  return false
}

const readAuthToken = (req) => {
  const header = String(req.headers?.authorization || '')
  if (!header) return ''
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim()
  }
  return ''
}

const ensureAuthToken = (req, res) => {
  const token = readAuthToken(req)
  if (!token) {
    res.status(401).json({ ok: false, error: 'Требуется авторизация.' })
    return null
  }
  const profile = getAuthProfile(token)
  if (!profile) {
    res.status(401).json({ ok: false, error: 'Сессия истекла. Войдите снова.' })
    return null
  }
  return { token, profile }
}

app.post('/api/auth/register', (req, res) => {
  if (!ensurePersistence(res)) return
  const username = String(req.body?.username || '')
  const password = String(req.body?.password || '')
  const profile = {
    firstName: String(req.body?.firstName || ''),
    lastName: String(req.body?.lastName || ''),
    nickname: String(req.body?.nickname || ''),
    age: req.body?.age,
    activity: String(req.body?.activity || ''),
    avatarUrl: String(req.body?.avatarUrl || ''),
    bio: String(req.body?.bio || ''),
  }
  const result = registerUser({ username, password, profile, userAgent: req.headers['user-agent'] || '' })
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.post('/api/auth/login', (req, res) => {
  if (!ensurePersistence(res)) return
  const username = String(req.body?.username || '')
  const password = String(req.body?.password || '')
  const result = loginUser({ username, password, userAgent: req.headers['user-agent'] || '' })
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.post('/api/auth/logout', (req, res) => {
  if (!ensurePersistence(res)) return
  const token = readAuthToken(req)
  if (token) {
    logoutSession(token)
  }
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  if (!ensurePersistence(res)) return
  const token = readAuthToken(req)
  const profile = getAuthProfile(token)
  if (!profile) {
    res.status(401).json({ ok: false, error: 'Сессия недействительна.' })
    return
  }
  res.json({ ok: true, profile })
})

app.put('/api/profile/me', (req, res) => {
  if (!ensurePersistence(res)) return
  const token = readAuthToken(req)
  if (!token) {
    res.status(401).json({ ok: false, error: 'Требуется авторизация.' })
    return
  }

  const result = updateProfileByToken(token, {
    firstName: String(req.body?.firstName || ''),
    lastName: String(req.body?.lastName || ''),
    nickname: String(req.body?.nickname || ''),
    age: req.body?.age,
    activity: String(req.body?.activity || ''),
    avatarUrl: String(req.body?.avatarUrl || ''),
    bio: String(req.body?.bio || ''),
  })

  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.get('/api/leaderboard', (req, res) => {
  if (!ensurePersistence(res)) return
  const limit = parseLimit(req.query?.limit, 20)
  res.json({
    ok: true,
    items: getLeaderboard(limit),
  })
})

app.get('/api/history', (req, res) => {
  if (!ensurePersistence(res)) return
  const limit = parseLimit(req.query?.limit, 15)
  res.json({
    ok: true,
    items: getRecentGames(limit),
  })
})

app.get('/api/history/:gameId', (req, res) => {
  if (!ensurePersistence(res)) return
  const gameId = Number(req.params?.gameId)
  if (!Number.isInteger(gameId) || gameId <= 0) {
    res.status(400).json({ ok: false, error: 'Некорректный идентификатор игры.' })
    return
  }

  const details = getGameDetails(gameId)
  if (!details) {
    res.status(404).json({ ok: false, error: 'Игра не найдена.' })
    return
  }

  res.json({
    ok: true,
    ...details,
  })
})

app.get('/api/users/search', (req, res) => {
  if (!ensurePersistence(res)) return
  const auth = ensureAuthToken(req, res)
  if (!auth) return

  const query = String(req.query?.query || '')
  const limit = parseLimit(req.query?.limit, 15)
  const result = searchUsers(query, auth.token, limit)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.get('/api/friends', (req, res) => {
  if (!ensurePersistence(res)) return
  const auth = ensureAuthToken(req, res)
  if (!auth) return

  const result = getFriendsOverview(auth.token)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.post('/api/friends/request', (req, res) => {
  if (!ensurePersistence(res)) return
  const auth = ensureAuthToken(req, res)
  if (!auth) return

  const username = String(req.body?.username || '')
  const result = sendFriendRequest(auth.token, username)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.post('/api/friends/respond', (req, res) => {
  if (!ensurePersistence(res)) return
  const auth = ensureAuthToken(req, res)
  if (!auth) return

  const requestId = Number(req.body?.requestId)
  const action = String(req.body?.action || '')
  const result = respondFriendRequest(auth.token, requestId, action)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.get('/api/friends/invites', (req, res) => {
  if (!ensurePersistence(res)) return
  const auth = ensureAuthToken(req, res)
  if (!auth) return

  const limit = parseLimit(req.query?.limit, 20)
  const result = getGameInvites(auth.token, limit)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.post('/api/friends/invite', (req, res) => {
  if (!ensurePersistence(res)) return
  const auth = ensureAuthToken(req, res)
  if (!auth) return

  const username = String(req.body?.username || '')
  const pin = String(req.body?.pin || '')
  const theme = String(req.body?.theme || '')
  const message = String(req.body?.message || '')

  const result = sendGameInvite(auth.token, username, { pin, theme, message })
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.post('/api/friends/invites/respond', (req, res) => {
  if (!ensurePersistence(res)) return
  const auth = ensureAuthToken(req, res)
  if (!auth) return

  const inviteId = Number(req.body?.inviteId)
  const action = String(req.body?.action || '')
  const result = respondGameInvite(auth.token, inviteId, action)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.get('/api/chats', (req, res) => {
  if (!ensurePersistence(res)) return
  const auth = ensureAuthToken(req, res)
  if (!auth) return

  const limit = parseLimit(req.query?.limit, 30)
  const result = getChatList(auth.token, limit)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.get('/api/chats/:username/messages', (req, res) => {
  if (!ensurePersistence(res)) return
  const auth = ensureAuthToken(req, res)
  if (!auth) return

  const username = String(req.params?.username || '').trim()
  const limit = parseLimit(req.query?.limit, 120)
  if (!username) {
    res.status(400).json({ ok: false, error: 'Пользователь чата не указан.' })
    return
  }

  const result = getChatMessages(auth.token, username, limit)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.post('/api/chats/:username/messages', (req, res) => {
  if (!ensurePersistence(res)) return
  const auth = ensureAuthToken(req, res)
  if (!auth) return

  const username = String(req.params?.username || '').trim()
  const text = String(req.body?.text || '')
  if (!username) {
    res.status(400).json({ ok: false, error: 'Пользователь чата не указан.' })
    return
  }

  const result = sendChatMessage(auth.token, username, text)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})

app.get('/api/profile/:username', (req, res) => {
  if (!ensurePersistence(res)) return
  const username = String(req.params?.username || '').trim()
  const limit = parseLimit(req.query?.limit, 15)
  if (!username) {
    res.status(400).json({ ok: false, error: 'Имя пользователя не указано.' })
    return
  }
  const token = readAuthToken(req)
  const profile = getProfileWithGames(username, limit, token)
  if (!profile) {
    res.status(404).json({ ok: false, error: 'Профиль не найден.' })
    return
  }
  res.json({
    ok: true,
    ...profile,
  })
})

const normalizeRoomStatusFilter = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (!normalized) return 'lobby'
  if (normalized === 'all') return 'all'
  if (normalized === 'lobby' || normalized === 'running' || normalized === 'paused' || normalized === 'finished') {
    return normalized
  }
  return 'lobby'
}

const roomMatchesSearch = (room, query) => {
  const needle = String(query || '')
    .trim()
    .toLowerCase()
  if (!needle) return true

  const selectedModeLabels = (room.selectedModes || [])
    .map((modeId) => modeCatalog[modeId] || '')
    .filter(Boolean)
    .join(' ')
  const gameModeLabel = getGameModeConfig(room).label
  const formatLabel = room.format === 'ffa' ? 'все против всех' : 'командный матч'

  const haystack = [
    room.pin,
    room.theme,
    room.hostName,
    gameModeLabel,
    formatLabel,
    selectedModeLabels,
    room.audience?.label,
    room.tone?.label,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(needle)
}

const serializeRoomForDirectory = (room) => {
  const gameMode = getGameModeConfig(room)
  const population = teamPopulation(room)
  const participants = [...room.participants.values()]
  const hostParticipant = participants.find((participant) => participant.isHost)
  const playersCount = participants.filter((participant) => !participant.isHost).length

  return {
    pin: room.pin,
    theme: room.theme,
    status: room.status,
    format: room.format,
    formatLabel: room.format === 'ffa' ? 'Все против всех' : 'Команды A/B',
    gameMode: gameMode.id,
    gameModeLabel: gameMode.label,
    hostName: room.hostName || hostParticipant?.name || 'Ведущий',
    hasPassword: Boolean(room.roomPassword),
    playersCount,
    participantsCount: participants.length,
    teams: {
      A: population.A,
      B: population.B,
    },
    questionCount: room.questionCount,
    timerSeconds: room.timerSeconds,
    selectedModes: (room.selectedModes || []).map((modeId) => modeCatalog[modeId]).filter(Boolean),
    audience: room.audience?.label || audienceCatalog.universal.label,
    tone: room.tone?.label || toneCatalog.balanced.label,
    createdAt: room.createdAt,
  }
}

app.get('/api/rooms', (req, res) => {
  const statusFilter = normalizeRoomStatusFilter(req.query?.status)
  const formatFilter = String(req.query?.format || '')
    .trim()
    .toLowerCase()
  const query = String(req.query?.q || '')
  const limit = parseLimit(req.query?.limit, 40)

  const filtered = [...rooms.values()]
    .filter((room) => (statusFilter === 'all' ? true : room.status === statusFilter))
    .filter((room) => Boolean(room.hostSocketId))
    .filter((room) => (formatFilter === 'teams' || formatFilter === 'ffa' ? room.format === formatFilter : true))
    .filter((room) => roomMatchesSearch(room, query))
    .sort((a, b) => b.createdAt - a.createdAt)

  res.json({
    ok: true,
    status: statusFilter,
    total: filtered.length,
    items: filtered.slice(0, limit).map((room) => serializeRoomForDirectory(room)),
  })
})

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'quizbattle-server',
    ts: Date.now(),
    activeRooms: rooms.size,
    persistenceEnabled,
  })
})

app.get('/meta', (_req, res) => {
  const hasOpenAI = Boolean(String(process.env.OPENAI_API_KEY || '').trim())
  const hasGemini = Boolean(String(process.env.GEMINI_API_KEY || '').trim())
  const hasGroq = Boolean(String(process.env.GROQ_API_KEY || '').trim())
  const hasYandex = Boolean(String(process.env.YC_API_KEY || '').trim()) && Boolean(String(process.env.YC_FOLDER_ID || '').trim())
  const hasGigachat =
    Boolean(String(process.env.GIGACHAT_ACCESS_TOKEN || '').trim()) ||
    Boolean(String(process.env.GIGACHAT_AUTH_KEY || '').trim()) ||
    (Boolean(String(process.env.GIGACHAT_CLIENT_ID || '').trim()) &&
      Boolean(String(process.env.GIGACHAT_CLIENT_SECRET || '').trim()))

  res.json({
    ok: true,
    audienceCatalog: Object.values(audienceCatalog),
    toneCatalog: Object.values(toneCatalog),
    aiMode: SERVER_AI_MODE,
    persistenceEnabled,
    questionCountOptions: [5, 6, 7],
    pinFormat: '6 chars [A-Z0-9]',
    gameFormats: ['teams', 'ffa'],
    gameplayModes: Object.values(gameModeCatalog).map((mode) => ({
      key: mode.id,
      label: mode.label,
      format: mode.format,
      passEnabled: mode.passEnabled,
      speedBonusForced: mode.forceSpeedBonus,
      timerMultiplier: mode.timerMultiplier,
      streakBonus: mode.streakBonus,
      bonusCorrect: mode.bonusCorrect,
    })),
    difficultyModes: ['mixed', 'easy', 'medium', 'hard'],
    modes: Object.entries(modeCatalog).map(([key, label]) => ({ key, label })),
    aiProviders: {
      openai: {
        enabled: hasOpenAI,
        model: String(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
        reviewModel: String(process.env.OPENAI_REVIEW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'),
      },
      gemini: {
        enabled: hasGemini,
        model: String(process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
        reviewModel: String(process.env.GEMINI_REVIEW_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-pro'),
      },
      groq: {
        enabled: hasGroq,
        model: String(process.env.GROQ_MODEL || 'openai/gpt-oss-20b'),
        reviewModel: String(process.env.GROQ_REVIEW_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-20b'),
      },
      yandex: {
        enabled: hasYandex,
        model: String(process.env.YC_MODEL || 'yandexgpt-lite/latest'),
        reviewModel: String(process.env.YC_REVIEW_MODEL || process.env.YC_MODEL || 'yandexgpt-lite/latest'),
      },
      gigachat: {
        enabled: hasGigachat,
        model: String(process.env.GIGACHAT_MODEL || 'GigaChat-2-Pro'),
        reviewModel: String(process.env.GIGACHAT_REVIEW_MODEL || process.env.GIGACHAT_MODEL || 'GigaChat-2-Pro'),
      },
    },
  })
})

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: '*',
  },
})

const PORT = Number(process.env.PORT || 4000)
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5175'
const EXPORTS_DIR = path.resolve(process.cwd(), 'exports')
const HOST_RECONNECT_GRACE_MS = 90000
const PLAYER_RECONNECT_GRACE_MS = 60000
const START_GENERATION_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.START_GENERATION_TIMEOUT_MS)
  if (!Number.isFinite(parsed)) return 35000
  return Math.min(120000, Math.max(10000, Math.round(parsed)))
})()
const FALLBACK_GENERATION_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.FALLBACK_GENERATION_TIMEOUT_MS)
  if (!Number.isFinite(parsed)) return 18000
  return Math.min(60000, Math.max(8000, Math.round(parsed)))
})()
const ROUND_REVIEW_BASE_MS = (() => {
  const parsed = Number(process.env.ROUND_REVIEW_BASE_MS)
  if (!Number.isFinite(parsed)) return 4200
  return Math.min(9000, Math.max(2500, Math.round(parsed)))
})()
const ROUND_REVIEW_PER_BLOCK_MS = (() => {
  const parsed = Number(process.env.ROUND_REVIEW_PER_BLOCK_MS)
  if (!Number.isFinite(parsed)) return 550
  return Math.min(2200, Math.max(0, Math.round(parsed)))
})()
const ROUND_REVIEW_MAX_MS = (() => {
  const parsed = Number(process.env.ROUND_REVIEW_MAX_MS)
  if (!Number.isFinite(parsed)) return 7000
  return Math.min(14000, Math.max(3200, Math.round(parsed)))
})()

const audienceCatalog = {
  universal: {
    key: 'universal',
    label: 'Для всех',
  },
  students: {
    key: 'students',
    label: 'Школьники и студенты',
  },
  hackathons: {
    key: 'hackathons',
    label: 'Хакатоны и мероприятия',
  },
  teachers: {
    key: 'teachers',
    label: 'Учебный класс',
  },
  corporate: {
    key: 'corporate',
    label: 'Корпоративный тимбилдинг',
  },
}

const toneCatalog = {
  balanced: {
    key: 'balanced',
    label: 'Сбалансированный',
  },
  fun: {
    key: 'fun',
    label: 'Фан и динамика',
  },
  challenge: {
    key: 'challenge',
    label: 'Сложный соревновательный',
  },
}

const aiModeCatalog = new Set(['auto', 'free', 'openai', 'yandex', 'gigachat', 'hybrid', 'synthetic'])
const SERVER_AI_MODE = (() => {
  const configured = String(process.env.SERVER_AI_MODE || process.env.AI_PROVIDER || 'hybrid')
    .trim()
    .toLowerCase()
  return aiModeCatalog.has(configured) ? configured : 'hybrid'
})()
const providerLabel = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  groq: 'Groq',
  yandex: 'YandexGPT',
  gigachat: 'GigaChat',
  hybrid: 'Hybrid AI',
  synthetic: 'Бесплатный тематический генератор',
}
const modeCatalog = {
  capitals: 'Столицы',
  flags: 'Флаги',
  equations: 'Равенства',
  dice: 'Игральные кости',
  colors: 'Цвета',
  timer: 'Обратный отсчет',
  blitz: 'Блиц-раунд',
  expert: 'Экспертный раунд',
}
const validModes = new Set(Object.keys(modeCatalog))
const allowedQuestionCount = new Set([5, 6, 7])
const formatCatalog = new Set(['teams', 'ffa'])
const difficultyCatalog = new Set(['mixed', 'easy', 'medium', 'hard'])
const gameModeCatalog = {
  team_battle: {
    id: 'team_battle',
    label: 'Командная дуэль',
    format: 'teams',
    timerMultiplier: 1,
    forceSpeedBonus: false,
    passEnabled: true,
    bonusCorrect: 0,
    streakBonus: false,
  },
  solo_arena: {
    id: 'solo_arena',
    label: 'Соло-арена',
    format: 'ffa',
    timerMultiplier: 1,
    forceSpeedBonus: false,
    passEnabled: true,
    bonusCorrect: 0,
    streakBonus: false,
  },
  duel_1v1: {
    id: 'duel_1v1',
    label: 'Дуэль 1 на 1',
    format: 'teams',
    timerMultiplier: 1,
    forceSpeedBonus: false,
    passEnabled: true,
    bonusCorrect: 0,
    streakBonus: false,
  },
  turbo_storm: {
    id: 'turbo_storm',
    label: 'Турбо-шторм',
    format: 'teams',
    timerMultiplier: 0.65,
    forceSpeedBonus: true,
    passEnabled: false,
    bonusCorrect: 1,
    streakBonus: false,
  },
  combo_rush: {
    id: 'combo_rush',
    label: 'Комбо-гонка',
    format: 'ffa',
    timerMultiplier: 0.9,
    forceSpeedBonus: true,
    passEnabled: true,
    bonusCorrect: 0,
    streakBonus: true,
  },
}
const validGameModes = new Set(Object.keys(gameModeCatalog))
const defaultGameModeByFormat = {
  teams: 'team_battle',
  ffa: 'solo_arena',
}

const rooms = new Map()
const socketToRoom = new Map()

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const pickAudience = (value) => {
  const key = String(value || '').trim().toLowerCase()
  return audienceCatalog[key] ? audienceCatalog[key] : audienceCatalog.universal
}

const pickTone = (value) => {
  const key = String(value || '').trim().toLowerCase()
  return toneCatalog[key] ? toneCatalog[key] : toneCatalog.balanced
}

const pickSelectedModes = (input) => {
  if (!Array.isArray(input)) return ['capitals', 'flags', 'equations']
  const filtered = input
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item, index, list) => validModes.has(item) && list.indexOf(item) === index)

  return filtered.length > 0 ? filtered : ['capitals', 'flags', 'equations']
}

const pickQuestionCount = (value) => {
  const parsed = Number(value)
  return allowedQuestionCount.has(parsed) ? parsed : 5
}

const pickGameFormat = (value) => {
  const key = String(value || '').trim().toLowerCase()
  return formatCatalog.has(key) ? key : 'teams'
}

const pickGameMode = (value, fallbackFormat = 'teams') => {
  const key = String(value || '').trim().toLowerCase()
  if (validGameModes.has(key)) return key
  return defaultGameModeByFormat[fallbackFormat] || 'team_battle'
}

const getGameModeConfig = (room) => {
  const modeId = String(room?.gameMode || '').trim().toLowerCase()
  return gameModeCatalog[modeId] || gameModeCatalog.team_battle
}

const isDuelMode = (room) => getGameModeConfig(room).id === 'duel_1v1'

const pickDifficultyMode = (value) => {
  const key = String(value || '').trim().toLowerCase()
  return difficultyCatalog.has(key) ? key : 'mixed'
}

const pickRoomPassword = (value) => {
  const safe = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
  return safe
}

const isSpeedBonusEnabled = (value) => value === true || String(value || '').toLowerCase() === 'true'

const generatePin = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let pin = ''
  for (let index = 0; index < 6; index += 1) {
    pin += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return pin
}

const createUniquePin = () => {
  let pin = generatePin()
  while (rooms.has(pin)) {
    pin = generatePin()
  }
  return pin
}

const generateHostRejoinKey = () => crypto.randomBytes(24).toString('base64url')
const generatePlayerRejoinKey = () => crypto.randomBytes(18).toString('base64url')

const buildRounds = (questionCount) => {
  const rounds = []
  for (let index = 0; index < questionCount; index += 1) {
    rounds.push({ team: 'A', questionIndex: index })
    rounds.push({ team: 'B', questionIndex: index })
  }
  return rounds
}

const buildFfaRounds = (questionCount, playerIds) => {
  const rounds = []
  for (let questionIndex = 0; questionIndex < questionCount; questionIndex += 1) {
    playerIds.forEach((playerId) => {
      rounds.push({
        team: 'A',
        questionIndex,
        playerId,
      })
    })
  }
  return rounds
}

const now = () => Date.now()
const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

const getNonHostPlayers = (room) =>
  [...room.participants.values()].filter((participant) => !participant.isHost)

const getParticipantById = (room, participantId) => {
  if (!participantId) return null
  for (const participant of room.participants.values()) {
    if (participant.id === participantId) return participant
  }
  return null
}

const teamPopulation = (room) => {
  if (room.format === 'ffa') {
    return {
      A: getNonHostPlayers(room).length,
      B: 0,
    }
  }

  const players = getNonHostPlayers(room)
  return {
    A: players.filter((player) => player.team === 'A').length,
    B: players.filter((player) => player.team === 'B').length,
  }
}

const assignTeam = (room) => {
  if (room.format === 'ffa') return 'A'

  const population = teamPopulation(room)
  if (isDuelMode(room)) {
    if (population.A === 0) return 'A'
    if (population.B === 0) return 'B'
    return population.A <= population.B ? 'A' : 'B'
  }
  if (population.A === population.B) {
    return Math.random() > 0.5 ? 'A' : 'B'
  }
  return population.A < population.B ? 'A' : 'B'
}

const buildHostParticipant = (room, socketId) => ({
  id: 'host',
  socketId,
  name: room.hostName,
  team: 'HOST',
  isHost: true,
  joinedAt: now(),
  teamLocked: true,
})

const rebalanceTeamsInLobby = (room) => {
  if (room.status !== 'lobby') return
  if (room.format !== 'teams') return
  if (isDuelMode(room)) return

  const players = getNonHostPlayers(room).sort((a, b) => a.joinedAt - b.joinedAt)
  const byTeam = {
    A: players.filter((item) => item.team === 'A'),
    B: players.filter((item) => item.team === 'B'),
  }

  if (Math.abs(byTeam.A.length - byTeam.B.length) <= 1) return

  const pickUnlockedCandidate = (list) => {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (!list[index]?.teamLocked) return list[index]
    }
    return null
  }

  if (byTeam.A.length > byTeam.B.length) {
    const candidate = pickUnlockedCandidate(byTeam.A)
    if (candidate) candidate.team = 'B'
  } else {
    const candidate = pickUnlockedCandidate(byTeam.B)
    if (candidate) candidate.team = 'A'
  }
}

const getCurrentRound = (room) => {
  if (room.roundIndex < 0 || room.roundIndex >= room.rounds.length) return null
  return room.rounds[room.roundIndex]
}

const getQuestionForRound = (room, round) => {
  if (!round) return null
  if (room.format === 'ffa') {
    return room.questionBank[round.questionIndex] || null
  }
  const list = room.questionSets[round.team]
  return list[round.questionIndex] || null
}

const roomHasMode = (room, modeId) =>
  Array.isArray(room?.selectedModes) && room.selectedModes.includes(modeId)

const getRoundDurationMs = (room) => {
  const gameMode = getGameModeConfig(room)
  const timerScale = Number.isFinite(gameMode.timerMultiplier) && gameMode.timerMultiplier > 0 ? gameMode.timerMultiplier : 1
  let base = Math.max(1000, Math.round(Number(room?.timerSeconds || 30) * 1000 * timerScale))
  if (roomHasMode(room, 'blitz')) {
    base = Math.max(8000, Math.round(base * 0.65))
  }
  return base
}

const isPassEnabled = (room) => Boolean(getGameModeConfig(room)?.passEnabled)

const getRoundReviewDelayMs = (question, submission) => {
  const questionSize = String(question?.question || '').length
  const explanationSize = String(question?.explanation || '').length
  const totalSize = questionSize + explanationSize
  const extraBlocks = Math.min(4, Math.floor(totalSize / 180))
  let delay = ROUND_REVIEW_BASE_MS + extraBlocks * ROUND_REVIEW_PER_BLOCK_MS

  if (submission?.type === 'timeout' || submission?.type === 'skip') {
    delay = Math.max(3000, delay - 600)
  } else if (submission?.type === 'pass' || (submission?.type === 'answer' && submission?.correct === false)) {
    delay += 400
  }

  return clamp(delay, 2600, ROUND_REVIEW_MAX_MS)
}

const getTeamVoteState = (room, team) => {
  if (!room || room.format !== 'teams') return null
  if (!room.teamVoteState || room.teamVoteState.team !== team) return null
  return room.teamVoteState
}

const ensureTeamVoteState = (room, team) => {
  if (!room || room.format !== 'teams') return null
  if (!room.teamVoteState || room.teamVoteState.team !== team) {
    room.teamVoteState = {
      team,
      votes: {},
    }
  }
  return room.teamVoteState
}

const getTeamVoters = (room, team) =>
  getNonHostPlayers(room)
    .filter((participant) => participant.team === team)
    .map((participant) => participant.id)

const buildTeamVotingSnapshot = (room, team, viewerId = null) => {
  const voterIds = getTeamVoters(room, team)
  const voteState = getTeamVoteState(room, team)
  const votes = voteState?.votes || {}
  const optionVotes = [0, 0, 0, 0]
  let passVotes = 0
  let submitted = 0

  voterIds.forEach((participantId) => {
    const entry = votes[participantId]
    if (!entry) return
    submitted += 1
    if (entry.answerIndex === null) {
      passVotes += 1
      return
    }
    if (Number.isInteger(entry.answerIndex) && entry.answerIndex >= 0 && entry.answerIndex <= 3) {
      optionVotes[entry.answerIndex] += 1
    }
  })

  const myVote = viewerId && votes[viewerId] ? votes[viewerId] : null
  return {
    total: voterIds.length,
    submitted,
    optionVotes,
    passVotes,
    myVoteIndex: Number.isInteger(myVote?.answerIndex) ? myVote.answerIndex : null,
    myPassed: Boolean(myVote && myVote.answerIndex === null),
  }
}

const getReadyQuestionPackCount = (room) => {
  if (room.format === 'ffa') return room.questionBank.length
  return Math.min(room.questionSets.A.length, room.questionSets.B.length)
}

const getGenerationProgressSnapshot = (room) => ({
  ready: getReadyQuestionPackCount(room),
  total: room.questionCount,
  inFlight: Boolean(room.generationInFlight),
  error: room.generationError || null,
})

const questionUniqKey = (question) =>
  String(question?.question || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const pushUniqueQuestions = ({ target, source, usedKeys, limit }) => {
  if (!Array.isArray(source) || target.length >= limit) return
  source.forEach((question) => {
    if (!question || target.length >= limit) return
    const key = questionUniqKey(question)
    if (!key || usedKeys.has(key)) return
    usedKeys.add(key)
    target.push(question)
  })
}

const buildEmergencyQuestion = (room, seq) => {
  const token = seq + 1
  const core = `Какое утверждение по теме «${room.theme}» верно? (${token})`
  const options = [
    `Корректный факт по теме «${room.theme}»`,
    `Случайное неверное утверждение №${token}A`,
    `Случайное неверное утверждение №${token}B`,
    `Случайное неверное утверждение №${token}C`,
  ]
  return {
    id: `fallback-${Date.now()}-${token}`,
    question: core,
    options,
    correctIndex: 0,
    explanation: `Правильный вариант отмечает корректный факт по теме «${room.theme}».`,
    difficulty: 'easy',
    image: null,
  }
}

const buildSupplementQuestionPool = async (room, requiredCount, usedKeys) => {
  if (requiredCount <= 0) return []
  try {
    const topUpGeneration = await withTimeout(
      generateQuizQuestions({
        theme: room.theme,
        count: Math.min(12, Math.max(room.questionCount, requiredCount + 2)),
        preferSpeed: true,
        audience: room.audience?.key || 'universal',
        tone: room.tone?.key || 'balanced',
        difficultyMode: room.difficultyMode || 'mixed',
        aiMode: 'synthetic',
        modes: room.selectedModes || ['capitals', 'flags', 'equations'],
      }),
      Math.min(FALLBACK_GENERATION_TIMEOUT_MS, 14000),
      'Дополнительная генерация уникальных вопросов не успела завершиться.',
    )

    const pool = []
    const localSeen = new Set(usedKeys)
    const mergeList = [
      ...(Array.isArray(topUpGeneration?.questionSets?.A) ? topUpGeneration.questionSets.A : []),
      ...(Array.isArray(topUpGeneration?.questionSets?.B) ? topUpGeneration.questionSets.B : []),
    ]
    mergeList.forEach((question) => {
      const key = questionUniqKey(question)
      if (!key || localSeen.has(key)) return
      localSeen.add(key)
      pool.push(question)
    })
    return pool
  } catch {
    return []
  }
}

const applyGeneratedQuestionSets = async (room, generation) => {
  const generatedA = Array.isArray(generation?.questionSets?.A) ? generation.questionSets.A : []
  const generatedB = Array.isArray(generation?.questionSets?.B) ? generation.questionSets.B : []

  if (room.format === 'ffa') {
    const primary = generatedA.length > 0 ? generatedA : generatedB
    const secondary = generatedA.length > 0 ? generatedB : generatedA
    const usedKeys = new Set()
    const bank = []

    pushUniqueQuestions({ target: bank, source: primary, usedKeys, limit: room.questionCount })
    pushUniqueQuestions({ target: bank, source: secondary, usedKeys, limit: room.questionCount })

    if (bank.length < room.questionCount) {
      const supplementPool = await buildSupplementQuestionPool(room, room.questionCount - bank.length, usedKeys)
      pushUniqueQuestions({ target: bank, source: supplementPool, usedKeys, limit: room.questionCount })
    }

    let emergencySeq = 0
    while (bank.length < room.questionCount) {
      const emergency = buildEmergencyQuestion(room, bank.length + emergencySeq)
      const key = questionUniqKey(emergency)
      emergencySeq += 1
      if (!key || usedKeys.has(key)) continue
      usedKeys.add(key)
      bank.push(emergency)
    }

    room.questionBank = bank
    room.questionSets = { A: [], B: [] }
  } else {
    const usedKeys = new Set()
    const listA = []
    const listB = []
    const crossPool = [...generatedA, ...generatedB]

    pushUniqueQuestions({ target: listA, source: generatedA, usedKeys, limit: room.questionCount })
    pushUniqueQuestions({ target: listA, source: crossPool, usedKeys, limit: room.questionCount })

    pushUniqueQuestions({ target: listB, source: generatedB, usedKeys, limit: room.questionCount })
    pushUniqueQuestions({ target: listB, source: crossPool, usedKeys, limit: room.questionCount })

    const teamMissing = Math.max(0, room.questionCount - listA.length) + Math.max(0, room.questionCount - listB.length)
    if (teamMissing > 0) {
      const supplementPool = await buildSupplementQuestionPool(room, teamMissing, usedKeys)
      pushUniqueQuestions({ target: listA, source: supplementPool, usedKeys, limit: room.questionCount })
      pushUniqueQuestions({ target: listB, source: supplementPool, usedKeys, limit: room.questionCount })
    }

    let emergencySeqA = 0
    while (listA.length < room.questionCount) {
      const emergency = buildEmergencyQuestion(room, listA.length + listB.length + emergencySeqA)
      const key = questionUniqKey(emergency)
      emergencySeqA += 1
      if (!key || usedKeys.has(key)) continue
      usedKeys.add(key)
      listA.push(emergency)
    }

    let emergencySeqB = 0
    while (listB.length < room.questionCount) {
      const emergency = buildEmergencyQuestion(room, listA.length + listB.length + emergencySeqB)
      const key = questionUniqKey(emergency)
      emergencySeqB += 1
      if (!key || usedKeys.has(key)) continue
      usedKeys.add(key)
      listB.push(emergency)
    }

    room.questionSets = {
      A: listA,
      B: listB,
    }
    room.questionBank = []
  }

  room.provider = generation?.provider || room.provider || 'synthetic'
  room.generationError = ''
}

const generateFullQuestionSetForRoom = async (room) => {
  let generation = null
  try {
    generation = await withTimeout(
      generateQuizQuestions({
        theme: room.theme,
        count: room.questionCount,
        preferSpeed: true,
        audience: room.audience?.key || 'universal',
        tone: room.tone?.key || 'balanced',
        difficultyMode: room.difficultyMode || 'mixed',
        aiMode: room.aiMode || 'free',
        modes: room.selectedModes || ['capitals', 'flags', 'equations'],
      }),
      START_GENERATION_TIMEOUT_MS,
      'Превышено время генерации вопросов.',
    )
  } catch {
    room.timeline.unshift('Основной AI-режим задержался. Включаем быстрый резервный генератор.')
    if (rooms.has(room.pin)) emitRoomState(room)
    generation = await withTimeout(
      generateQuizQuestions({
        theme: room.theme,
        count: room.questionCount,
        preferSpeed: true,
        audience: room.audience?.key || 'universal',
        tone: room.tone?.key || 'balanced',
        difficultyMode: room.difficultyMode || 'mixed',
        aiMode: 'synthetic',
        modes: room.selectedModes || ['capitals', 'flags', 'equations'],
      }),
      FALLBACK_GENERATION_TIMEOUT_MS,
      'Резервный генератор не успел подготовить вопросы.',
    )
  }

  if (!rooms.has(room.pin)) return
  await applyGeneratedQuestionSets(room, generation)
}

const ensureFullQuestionSet = async (room) => {
  if (room.generationInFlight) {
    await room.generationInFlight
    return
  }

  room.generationInFlight = generateFullQuestionSetForRoom(room)
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Ошибка генерации вопросов.'
      room.generationError = message
      throw error
    })
    .finally(() => {
      room.generationInFlight = null
    })

  await room.generationInFlight
}

const startCurrentRoundIfReady = (room) => {
  const round = getCurrentRound(room)
  const question = getQuestionForRound(room, round)
  if (!round || !question) return false

  room.currentSubmission = null
  room.teamVoteState = room.format === 'teams' ? { team: round.team, votes: {} } : null
  room.roundStartedAt = now()
  room.roundDeadlineAt = room.roundStartedAt + getRoundDurationMs(room)
  room.pausedRemainingMs = null
  room.status = 'running'

  room.timeline.unshift(`Раунд ${room.roundIndex + 1}/${room.rounds.length}: ходит ${getRoundActorLabel(room, round)}`)
  emitRoomState(room)
  return true
}

const scoreForAnswer = (room, elapsedMs, question) => {
  const gameMode = getGameModeConfig(room)
  const modeBonus = Math.max(0, Number(gameMode?.bonusCorrect || 0))
  if (!room.speedBonusEnabled) {
    const expertBonus = roomHasMode(room, 'expert') && question?.difficulty === 'hard' ? 1 : 0
    return { base: 1 + expertBonus + modeBonus, bonus: 0 }
  }

  const totalMs = Math.max(1, getRoundDurationMs(room))
  const ratio = 1 - clamp(elapsedMs, 0, totalMs) / totalMs
  let bonus = 0
  if (ratio >= 0.67) bonus = 2
  else if (ratio >= 0.34) bonus = 1
  const expertBonus = roomHasMode(room, 'expert') && question?.difficulty === 'hard' ? 1 : 0

  return {
    base: 1 + expertBonus + modeBonus,
    bonus,
  }
}

const sanitizeFileToken = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'game'

const ensureParticipantStat = (room, participant) => {
  if (!participant || participant.isHost) return null
  if (!room.playerStats[participant.id]) {
    room.playerStats[participant.id] = {
      id: participant.id,
      name: participant.name,
      team: participant.team,
      answers: 0,
      correct: 0,
      wrong: 0,
      timeouts: 0,
      skips: 0,
      points: 0,
      joinedAt: participant.joinedAt || now(),
      leftAt: null,
      connected: true,
      disqualified: false,
    }
  }

  const stat = room.playerStats[participant.id]
  stat.name = participant.name
  stat.team = participant.team
  stat.connected = true
  stat.disqualified = false
  stat.leftAt = null
  return stat
}

const markParticipantDisconnected = (room, participant) => {
  if (!participant || participant.isHost) return
  const stat = room.playerStats[participant.id]
  if (!stat) return
  stat.connected = false
  stat.leftAt = now()
}

const applyTeamPenaltyStats = (room, team, penaltyType) => {
  room.participants.forEach((participant) => {
    if (participant.isHost) return
    if (participant.team !== team) return
    const stat = ensureParticipantStat(room, participant)
    if (!stat) return
    if (penaltyType === 'timeout') stat.timeouts += 1
    if (penaltyType === 'skip') {
      stat.timeouts += 1
      stat.skips += 1
    }
    if (penaltyType === 'pass') {
      stat.skips += 1
    }
  })
}

const applyRoundPenaltyStats = (room, round, penaltyType) => {
  if (!round) return

  if (room.format === 'ffa') {
    const stat = room.playerStats[round.playerId]
    if (!stat) return
    if (penaltyType === 'timeout') stat.timeouts += 1
    if (penaltyType === 'skip') {
      stat.timeouts += 1
      stat.skips += 1
    }
    if (penaltyType === 'pass') {
      stat.skips += 1
    }
    return
  }

  applyTeamPenaltyStats(room, round.team, penaltyType)
}

const resetRoundActorStreak = (room, round) => {
  if (!round || room?.format !== 'ffa') return
  if (!room.playerStreaks) room.playerStreaks = {}
  if (!round.playerId) return
  room.playerStreaks[round.playerId] = 0
}

const applyCorrectStreakBonus = (room, participantId) => {
  const gameMode = getGameModeConfig(room)
  if (!gameMode.streakBonus) return 0
  if (room?.format !== 'ffa' || !participantId) return 0
  if (!room.playerStreaks) room.playerStreaks = {}
  const currentStreak = Number(room.playerStreaks[participantId] || 0) + 1
  room.playerStreaks[participantId] = currentStreak
  return Math.min(3, Math.max(0, currentStreak - 1))
}

const buildPlayerStatsView = (room) =>
  Object.values(room.playerStats)
    .map((item) => ({
      ...item,
      accuracy: item.answers > 0 ? Math.round((item.correct / item.answers) * 100) : 0,
    }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name, 'ru'))

const buildFfaLeaderboard = (room) => buildPlayerStatsView(room).filter((item) => item.team === 'A' || item.team === 'B')

const computeWinnerState = (room) => {
  if (room.format === 'ffa') {
    const leaderboard = buildFfaLeaderboard(room)
    if (leaderboard.length === 0) {
      return { format: 'ffa', winner: null, isDraw: false, tied: [], leaderboard }
    }

    const top = leaderboard[0]
    const tied = leaderboard.filter((item) => item.points === top.points)
    return {
      format: 'ffa',
      winner: tied.length === 1 ? top : null,
      isDraw: tied.length > 1,
      tied,
      leaderboard,
    }
  }

  if (room.scores.A === room.scores.B) {
    return { format: 'teams', winner: 'draw', isDraw: true, tied: [] }
  }

  return {
    format: 'teams',
    winner: room.scores.A > room.scores.B ? 'A' : 'B',
    isDraw: false,
    tied: [],
  }
}

const buildResultHeadline = (room) => {
  const winner = computeWinnerState(room)
  if (winner.format === 'ffa') {
    if (winner.winner) return `Победил(а) ${winner.winner.name}`
    if (winner.isDraw && winner.tied.length > 0) return `Ничья: ${winner.tied.map((item) => item.name).join(', ')}`
    return 'Игра завершена'
  }

  if (winner.winner === 'draw') return 'Ничья'
  return winner.winner === 'A' ? 'Победила Команда A' : 'Победила Команда B'
}

const getRoundActorLabel = (room, round) => {
  if (!round) return 'Неизвестный участник'
  if (room.format !== 'ffa') return `Команда ${round.team}`
  const participant = getParticipantById(room, round.playerId)
  if (participant) return participant.name
  const stat = room.playerStats[round.playerId]
  return stat?.name || 'Игрок'
}

const persistRoomExport = async (room, trigger) => {
  await fs.mkdir(EXPORTS_DIR, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const themeToken = sanitizeFileToken(room.theme)
  const fileName = `${stamp}_${room.pin}_${themeToken}.json`
  const filePath = path.join(EXPORTS_DIR, fileName)

  const payload = {
    exportedAt: new Date().toISOString(),
    trigger,
    pin: room.pin,
    theme: room.theme,
    format: room.format,
    gameMode: room.gameMode || 'team_battle',
    difficultyMode: room.difficultyMode,
    speedBonusEnabled: room.speedBonusEnabled,
    hasPassword: Boolean(room.roomPassword),
    status: room.status,
    provider: room.provider,
    audience: room.audience,
    tone: room.tone,
    selectedModes: room.selectedModes,
    timerSeconds: room.timerSeconds,
    questionCount: room.questionCount,
    createdAt: room.createdAt,
    finishedAt: room.finishedAt,
    scores: room.scores,
    winner: (() => {
      const winner = computeWinnerState(room)
      if (winner.format === 'ffa') {
        if (winner.winner) return winner.winner.name
        if (winner.isDraw) return 'draw'
        return 'none'
      }
      return winner.winner
    })(),
    participants: [...room.participants.values()].map((participant) => ({
      id: participant.id,
      name: participant.name,
      team: participant.team,
      isHost: participant.isHost,
      joinedAt: participant.joinedAt,
    })),
    playerStats: buildPlayerStatsView(room),
    hardestQuestions: summarizeHardQuestions(room),
    roundHistory: Array.isArray(room.roundHistory) ? room.roundHistory : [],
    timeline: room.timeline.slice(0, 80),
  }

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  room.lastExport = {
    fileName,
    filePath,
    exportedAt: Date.now(),
    trigger,
  }

  return room.lastExport
}

const queueRoomExport = (room, trigger) => {
  if (room.exportInFlight) return room.exportInFlight
  room.exportInFlight = persistRoomExport(room, trigger)
    .catch(() => null)
    .finally(() => {
      room.exportInFlight = null
    })
  return room.exportInFlight
}

const summarizeHardQuestions = (room) => {
  const stats = Object.values(room.questionStats)
  return stats
    .map((stat) => {
      const total = stat.correct + stat.wrong + stat.timeouts
      const pain = stat.wrong * 2 + stat.timeouts * 2.5
      return {
        id: stat.id,
        team: stat.team,
        question: stat.question,
        wrong: stat.wrong,
        timeouts: stat.timeouts,
        correct: stat.correct,
        total,
        pain,
      }
    })
    .sort((a, b) => b.pain - a.pain || b.wrong - a.wrong)
    .slice(0, 5)
}

const serializeRoomForSocket = (room, socketId) => {
  const me = room.participants.get(socketId) || null
  const activeRound = getCurrentRound(room)
  const activeQuestion = getQuestionForRound(room, activeRound)

  const population = teamPopulation(room)

  const participants = [...room.participants.values()].map((participant) => ({
    id: participant.id,
    name: participant.name,
    team: participant.team,
    isHost: participant.isHost,
  }))

  const activeTeam = activeRound?.team || null
  const activePlayerId = room.format === 'ffa' ? activeRound?.playerId || null : null
  const activePlayerName = room.format === 'ffa' && activeRound ? getRoundActorLabel(room, activeRound) : null
  const teamVoting =
    room.format === 'teams' && activeRound && activeTeam
      ? buildTeamVotingSnapshot(room, activeTeam, me?.id || null)
      : null
  const revealOptions = Boolean(activeQuestion)

  const timeLeftMs = (() => {
    if (!activeRound) return 0
    if (room.status === 'paused') return room.pausedRemainingMs || 0
    if (!room.roundDeadlineAt) return 0
    return Math.max(0, room.roundDeadlineAt - now())
  })()

  const canAnswer =
    Boolean(activeRound) &&
    room.status === 'running' &&
    Boolean(me) &&
    !me.isHost &&
    (room.format === 'teams'
      ? me.team === activeTeam && !teamVoting?.myPassed && teamVoting?.myVoteIndex === null
      : me.id === activePlayerId) &&
    !room.currentSubmission

  const routeName = room.status === 'finished' ? buildResultHeadline(room) : ''
  const ffaLeaderboard = room.format === 'ffa' ? buildFfaLeaderboard(room) : []
  const gameMode = getGameModeConfig(room)

  return {
    pin: room.pin,
    inviteLink: `${CLIENT_URL}?pin=${room.pin}`,
    theme: room.theme,
    format: room.format,
    gameMode: {
      key: gameMode.id,
      label: gameMode.label,
      format: gameMode.format,
      passEnabled: Boolean(gameMode.passEnabled),
      speedBonusForced: Boolean(gameMode.forceSpeedBonus),
      timerMultiplier: gameMode.timerMultiplier,
      streakBonus: Boolean(gameMode.streakBonus),
      bonusCorrect: Number(gameMode.bonusCorrect || 0),
    },
    selectedModes: room.selectedModes || ['capitals', 'flags', 'equations'],
    audience: room.audience || audienceCatalog.universal,
    tone: room.tone || toneCatalog.balanced,
    difficultyMode: room.difficultyMode || 'mixed',
    speedBonusEnabled: Boolean(room.speedBonusEnabled),
    hasPassword: Boolean(room.roomPassword),
    aiMode: room.aiMode || 'free',
    status: room.status,
    provider: room.provider,
    providerLabel: providerLabel[room.provider] || room.provider,
    questionCount: room.questionCount,
    generation: getGenerationProgressSnapshot(room),
    timerSeconds: room.timerSeconds,
    hostOnline: Boolean(room.hostSocketId),
    hostReconnectDeadlineAt: room.hostReconnectDeadlineAt || 0,
    me,
    participants,
    scores: room.scores,
    teams: {
      A: {
        name: 'Команда A',
        members: population.A,
      },
      B: {
        name: 'Команда B',
        members: population.B,
      },
    },
    activeRound: activeRound
      ? {
          key:
            room.format === 'ffa'
              ? `P-${activeRound.playerId || 'unknown'}-${activeRound.questionIndex + 1}`
              : `${activeRound.team}-${activeRound.questionIndex + 1}`,
          team: activeRound.team,
          playerId: room.format === 'ffa' ? activeRound.playerId || null : null,
          playerName: activePlayerName,
          roundNumber: room.roundIndex + 1,
          totalRounds: room.rounds.length,
          questionNumberInTeam: activeRound.questionIndex + 1,
          roundDurationMs: getRoundDurationMs(room),
          question: activeQuestion
            ? {
                id: activeQuestion.id,
                text: activeQuestion.question,
                options: revealOptions ? activeQuestion.options : null,
                difficulty: activeQuestion.difficulty,
                image: activeQuestion.image || null,
              }
            : null,
          timeLeftMs,
          canAnswer,
          locked: Boolean(room.currentSubmission),
          teamVoting,
          currentSubmission: room.currentSubmission,
        }
      : null,
    lastRoundSummary: room.lastRoundSummary,
    roundHistory: Array.isArray(room.roundHistory) ? room.roundHistory : [],
    timeline: room.timeline.slice(0, 12),
    playerStats: buildPlayerStatsView(room),
    ffaLeaderboard,
    teamMetrics: room.teamMetrics,
    hardestQuestions: room.status === 'finished' ? summarizeHardQuestions(room) : [],
    resultHeadline: routeName,
    lastExport: room.lastExport || null,
    serverTime: now(),
    rules: {
      passEnabled: isPassEnabled(room),
    },
  }
}

const emitRoomState = (room) => {
  room.participants.forEach((_participant, socketId) => {
    io.to(socketId).emit('room:state', serializeRoomForSocket(room, socketId))
  })
}

const clearHostReconnectGrace = (room) => {
  if (room.hostGraceTimer) {
    clearTimeout(room.hostGraceTimer)
    room.hostGraceTimer = null
  }
  room.hostReconnectDeadlineAt = 0
}

const clearPlayerReconnectSlot = (room, playerKey) => {
  if (!playerKey) return
  const slot = room.playerReconnectSlots.get(playerKey)
  if (!slot) return
  if (slot.timer) clearTimeout(slot.timer)
  room.playerReconnectSlots.delete(playerKey)
}

const clearAllPlayerReconnectSlots = (room) => {
  room.playerReconnectSlots.forEach((slot) => {
    if (slot?.timer) clearTimeout(slot.timer)
  })
  room.playerReconnectSlots.clear()
}

const startHostReconnectGrace = (room, pin) => {
  clearHostReconnectGrace(room)
  room.hostReconnectDeadlineAt = now() + HOST_RECONNECT_GRACE_MS
  room.hostSocketId = null

  if (room.status === 'running') {
    room.pausedRemainingMs = Math.max(0, room.roundDeadlineAt - now())
    room.status = 'paused'
    room.timeline.unshift('Связь с ведущим потеряна. Игра на паузе, ожидаем переподключение.')
  } else {
    room.timeline.unshift('Ведущий временно отключился. Ожидаем переподключение.')
  }

  emitRoomState(room)

  room.hostGraceTimer = setTimeout(() => {
    closeRoom(pin, 'Ведущий отключился. Комната закрыта.')
  }, HOST_RECONNECT_GRACE_MS)
}

const startPlayerReconnectGrace = (room, participant) => {
  const playerKey = participant?.playerKey
  if (!playerKey) return

  clearPlayerReconnectSlot(room, playerKey)

  const deadlineAt = now() + PLAYER_RECONNECT_GRACE_MS
  const slot = {
    participant: {
      id: participant.id,
      name: participant.name,
      team: participant.team,
      isHost: false,
      joinedAt: participant.joinedAt,
      playerKey,
      teamLocked: Boolean(participant.teamLocked),
    },
    deadlineAt,
    timer: null,
  }

  slot.timer = setTimeout(() => {
    room.playerReconnectSlots.delete(playerKey)
    room.timeline.unshift(`${participant.name} не вернулся в игру после обрыва связи.`)
    emitRoomState(room)
  }, PLAYER_RECONNECT_GRACE_MS)

  room.playerReconnectSlots.set(playerKey, slot)
  room.timeline.unshift(`${participant.name} временно отключился(ась). Окно возврата: 60 секунд.`)
  emitRoomState(room)
}

const markQuestionStat = (room, question, roundTeam, resultType) => {
  if (!question) return
  if (!room.questionStats[question.id]) {
    room.questionStats[question.id] = {
      id: question.id,
      team: roundTeam,
      question: question.question,
      correct: 0,
      wrong: 0,
      timeouts: 0,
    }
  }

  const bucket = room.questionStats[question.id]
  if (resultType === 'correct') bucket.correct += 1
  if (resultType === 'wrong') bucket.wrong += 1
  if (resultType === 'timeout') bucket.timeouts += 1
}

const clearRoundTimer = (room) => {
  if (room.transitionTimer) {
    clearTimeout(room.transitionTimer)
    room.transitionTimer = null
  }
}

const persistFinishedRoom = async (room) => {
  if (room.persistedInDb) return
  room.persistedInDb = true

  const exportInfo = await queueRoomExport(room, 'auto-finish')
  if (!persistenceEnabled) return

  const winner = computeWinnerState(room)
  const playerStats = buildPlayerStatsView(room).filter((item) => item.team === 'A' || item.team === 'B')

  const winnerIds = new Set()
  if (winner.format === 'ffa') {
    if (winner.winner?.id) winnerIds.add(winner.winner.id)
  } else if (winner.winner === 'A' || winner.winner === 'B') {
    playerStats.forEach((item) => {
      if (item.team === winner.winner) winnerIds.add(item.id)
    })
  }

  persistFinishedGame({
    pin: room.pin,
    theme: room.theme,
    format: room.format,
    status: room.status,
    createdAt: room.createdAt,
    finishedAt: room.finishedAt,
    winner:
      winner.format === 'ffa'
        ? winner.winner?.name || (winner.isDraw ? 'draw' : 'none')
        : winner.winner,
    scoreA: room.scores.A,
    scoreB: room.scores.B,
    exportFile: exportInfo?.fileName || '',
    players: playerStats.map((item) => ({
      name: item.name,
      team: item.team,
      points: item.points,
      correct: item.correct,
      wrong: item.wrong,
      timeouts: item.timeouts,
      skips: item.skips,
      accuracy: item.accuracy,
      isWinner: winnerIds.has(item.id),
    })),
    roundHistory: Array.isArray(room.roundHistory) ? room.roundHistory : [],
  })
}

const finishGame = (room) => {
  room.status = 'finished'
  room.finishedAt = now()
  room.roundDeadlineAt = 0
  room.roundStartedAt = 0
  room.currentSubmission = null
  room.pausedRemainingMs = null
  if (room.format === 'ffa') {
    room.timeline.unshift(`Игра завершена. ${buildResultHeadline(room)}.`)
  } else {
    room.timeline.unshift(`Игра завершена. Счет: A ${room.scores.A} : B ${room.scores.B}`)
  }
  emitRoomState(room)
  void persistFinishedRoom(room).catch(() => {
    room.persistedInDb = false
  })
}

const advanceRound = (room) => {
  clearRoundTimer(room)

  if (room.roundIndex + 1 >= room.rounds.length) {
    finishGame(room)
    return
  }

  room.roundIndex += 1
  room.currentSubmission = null
  room.roundStartedAt = 0
  room.roundDeadlineAt = 0
  room.pausedRemainingMs = null
  room.status = 'running'

  const round = getCurrentRound(room)
  if (!round) {
    finishGame(room)
    return
  }

  if (startCurrentRoundIfReady(room)) return

  room.status = 'paused'
  room.pausedRemainingMs = getRoundDurationMs(room)
  room.timeline.unshift('Вопрос раунда недоступен. Поставили игру на паузу.')
  emitRoomState(room)
}

const resolveRound = (room, submission) => {
  const round = getCurrentRound(room)
  if (!round) return

  const question = getQuestionForRound(room, round)
  const roundDurationMs = getRoundDurationMs(room)
  let finalSubmission = submission

  if (!finalSubmission) {
    finalSubmission = {
      type: 'timeout',
      byName: 'Нет ответа',
      answerIndex: null,
      correct: false,
      points: 0,
      elapsedMs: roundDurationMs,
      expectedCorrectIndex: question?.correctIndex ?? null,
    }
    markQuestionStat(room, question, round.team, 'timeout')
    if (room.format === 'teams') {
      room.teamMetrics[round.team].timeouts += 1
    }
    applyRoundPenaltyStats(room, round, 'timeout')
  } else if (finalSubmission.correct) {
    markQuestionStat(room, question, round.team, 'correct')
  } else if (finalSubmission.type === 'pass') {
    markQuestionStat(room, question, round.team, 'wrong')
    if (room.format === 'teams') {
      room.teamMetrics[round.team].skips += 1
    }
    applyRoundPenaltyStats(room, round, 'pass')
  } else if (finalSubmission.type === 'skip') {
    markQuestionStat(room, question, round.team, 'timeout')
    if (room.format === 'teams') {
      room.teamMetrics[round.team].skips += 1
      room.teamMetrics[round.team].timeouts += 1
    }
    applyRoundPenaltyStats(room, round, 'skip')
  } else {
    markQuestionStat(room, question, round.team, 'wrong')
  }

  room.currentSubmission = finalSubmission
  room.teamVoteState = null
  room.roundDeadlineAt = 0

  room.lastRoundSummary = {
    team: round.team,
    playerId: room.format === 'ffa' ? round.playerId || null : null,
    playerName: room.format === 'ffa' ? getRoundActorLabel(room, round) : null,
    question: question?.question || 'Вопрос не найден',
    correctIndex: question?.correctIndex ?? 0,
    correctOption: question?.options?.[question.correctIndex] ?? '',
    explanation: question?.explanation || '',
    image: question?.image || null,
    submission: finalSubmission,
  }

  if (room.format === 'ffa') {
    const isCorrectAnswer = finalSubmission.type === 'answer' && finalSubmission.correct === true
    if (!isCorrectAnswer) {
      resetRoundActorStreak(room, round)
    }
  }

  if (!Array.isArray(room.roundHistory)) {
    room.roundHistory = []
  }
  const historyId =
    room.format === 'ffa'
      ? `round-${room.roundIndex + 1}-player-${round.playerId || 'unknown'}`
      : `round-${room.roundIndex + 1}-team-${round.team}`
  const historyEntry = {
    id: historyId,
    roundNumber: room.roundIndex + 1,
    totalRounds: room.rounds.length,
    team: round.team,
    playerId: room.format === 'ffa' ? round.playerId || null : null,
    playerName: room.format === 'ffa' ? getRoundActorLabel(room, round) : null,
    questionId: question?.id || '',
    question: question?.question || 'Вопрос не найден',
    options: Array.isArray(question?.options) ? question.options : [],
    correctIndex: question?.correctIndex ?? 0,
    correctOption: question?.options?.[question.correctIndex] ?? '',
    explanation: question?.explanation || '',
    difficulty: question?.difficulty || 'easy',
    image: question?.image || null,
    submission: {
      ...finalSubmission,
    },
  }
  const existingHistoryIndex = room.roundHistory.findIndex((item) => item.id === historyId)
  if (existingHistoryIndex >= 0) {
    room.roundHistory[existingHistoryIndex] = historyEntry
  } else {
    room.roundHistory.push(historyEntry)
  }

  if (finalSubmission.type === 'timeout') {
    if (room.format === 'ffa') {
      room.timeline.unshift(`${getRoundActorLabel(room, round)} не ответил(а) вовремя.`)
    } else {
      room.timeline.unshift(`Команда ${round.team} не ответила вовремя.`)
    }
  } else if (finalSubmission.type === 'skip') {
    if (room.format === 'ffa') {
      room.timeline.unshift(`Ведущий пропустил вопрос игрока ${getRoundActorLabel(room, round)}.`)
    } else {
      room.timeline.unshift(`Ведущий пропустил вопрос команды ${round.team}.`)
    }
  } else if (finalSubmission.type === 'pass') {
    if (room.format === 'ffa') {
      room.timeline.unshift(`${finalSubmission.byName} взял(а) пас.`)
    } else {
      room.timeline.unshift(`Команда ${round.team} выбрала пас.`)
    }
  } else if (finalSubmission.correct) {
    if (room.format === 'ffa') {
      room.timeline.unshift(`${finalSubmission.byName} получает ${finalSubmission.points} очков.`)
    } else {
      room.timeline.unshift(
        `Команда ${round.team} взяла ${finalSubmission.points} очков (${finalSubmission.byName}).`,
      )
    }
  } else {
    if (room.format === 'ffa') {
      room.timeline.unshift(`${finalSubmission.byName} ошибся(лась).`)
    } else {
      room.timeline.unshift(`Команда ${round.team} ошиблась. Ответил: ${finalSubmission.byName}.`)
    }
  }

  emitRoomState(room)

  const reviewDelayMs = getRoundReviewDelayMs(question, finalSubmission)
  room.transitionTimer = setTimeout(() => {
    advanceRound(room)
  }, reviewDelayMs)
}

const closeRoom = (pin, reason) => {
  const room = rooms.get(pin)
  if (!room) return

  clearHostReconnectGrace(room)
  clearAllPlayerReconnectSlots(room)
  clearRoundTimer(room)

  room.participants.forEach((participant, socketId) => {
    markParticipantDisconnected(room, participant)
    socketToRoom.delete(socketId)
    io.to(socketId).emit('room:closed', { pin, reason })
    const socket = io.sockets.sockets.get(socketId)
    if (socket) socket.leave(pin)
  })

  rooms.delete(pin)
}

const joinRoomSocket = (socket, pin) => {
  socket.join(pin)
  socketToRoom.set(socket.id, pin)
}

const sanitizeName = (value) => {
  const safe = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!safe) return 'Игрок'
  return safe.slice(0, 24)
}

const normalizeRejoinKey = (value) => {
  const safe = String(value || '').trim()
  if (!safe) return ''
  if (!/^[A-Za-z0-9_-]{12,120}$/.test(safe)) return ''
  return safe
}

const finalizeTeamRoundFromVotes = (room, reason = 'all-voted') => {
  if (!room || room.format !== 'teams' || room.currentSubmission) return false
  const round = getCurrentRound(room)
  if (!round) return false

  const question = getQuestionForRound(room, round)
  if (!question) return false

  const voteState = getTeamVoteState(room, round.team)
  if (!voteState) return false

  const voters = getNonHostPlayers(room).filter((participant) => participant.team === round.team)
  const voteEntries = voters
    .map((participant) => ({
      participant,
      vote: voteState.votes[participant.id] || null,
    }))
    .filter((item) => item.vote)

  if (voteEntries.length === 0) {
    if (reason === 'all-voted') return false
    resolveRound(room, null)
    return true
  }

  const optionVotes = [0, 0, 0, 0]
  let passVotes = 0
  voteEntries.forEach(({ vote }) => {
    if (vote.answerIndex === null) {
      passVotes += 1
      return
    }
    if (Number.isInteger(vote.answerIndex) && vote.answerIndex >= 0 && vote.answerIndex <= 3) {
      optionVotes[vote.answerIndex] += 1
    }
  })

  const bestOptionVotes = Math.max(...optionVotes)
  const elapsedMs = clamp(now() - room.roundStartedAt, 0, getRoundDurationMs(room))
  const passWins = passVotes > bestOptionVotes

  if (passWins || bestOptionVotes <= 0) {
    voteEntries.forEach(({ participant, vote }) => {
      const stat = ensureParticipantStat(room, participant)
      if (!stat) return
      if (vote.answerIndex === null) {
        stat.skips += 1
      } else {
        stat.answers += 1
        if (vote.answerIndex === question.correctIndex) stat.correct += 1
        else stat.wrong += 1
      }
    })

    resolveRound(room, {
      type: 'pass',
      byName: `Команда ${round.team}`,
      answerIndex: null,
      correct: false,
      points: 0,
      elapsedMs,
      expectedCorrectIndex: question.correctIndex,
    })
    return true
  }

  const winningOptions = []
  optionVotes.forEach((count, index) => {
    if (count === bestOptionVotes) winningOptions.push(index)
  })

  let answerIndex = winningOptions[0]
  if (winningOptions.length > 1) {
    const tiedVote = voteEntries
      .filter(({ vote }) => vote.answerIndex !== null && winningOptions.includes(vote.answerIndex))
      .sort((a, b) => a.vote.submittedAt - b.vote.submittedAt)[0]
    if (tiedVote && Number.isInteger(tiedVote.vote.answerIndex)) {
      answerIndex = tiedVote.vote.answerIndex
    }
  }

  const correct = answerIndex === question.correctIndex
  let points = 0
  if (correct) {
    const score = scoreForAnswer(room, elapsedMs, question)
    points = score.base + score.bonus
    room.scores[round.team] += points
  }

  voteEntries.forEach(({ participant, vote }) => {
    const stat = ensureParticipantStat(room, participant)
    if (!stat) return
    if (vote.answerIndex === null) {
      stat.skips += 1
      return
    }
    stat.answers += 1
    if (vote.answerIndex === question.correctIndex) stat.correct += 1
    else stat.wrong += 1
    if (correct && vote.answerIndex === answerIndex) {
      stat.points += points
    }
  })

  resolveRound(room, {
    type: 'answer',
    byName: `Команда ${round.team} (большинство ${bestOptionVotes}/${voteEntries.length})`,
    answerIndex,
    correct,
    points,
    elapsedMs,
    expectedCorrectIndex: question.correctIndex,
  })

  return true
}

const finalizeTeamRoundIfReady = (room, reason = 'all-voted') => {
  if (!room || room.format !== 'teams' || room.currentSubmission) return false
  const round = getCurrentRound(room)
  if (!round) return false
  const snapshot = buildTeamVotingSnapshot(room, round.team)
  if (reason === 'all-voted') {
    if (snapshot.total < 1 || snapshot.submitted < snapshot.total) return false
  } else if (reason === 'timeout') {
    if (snapshot.submitted < 1) return false
  }
  return finalizeTeamRoundFromVotes(room, reason)
}

const skipRoundByHost = (room, hostName) => {
  if (room.status !== 'running' && room.status !== 'paused') {
    return { ok: false, error: 'Пропуск доступен только во время игры.' }
  }

  if (room.currentSubmission) {
    return { ok: false, error: 'Раунд уже завершен, идет переход.' }
  }

  const round = getCurrentRound(room)
  if (!round) {
    return { ok: false, error: 'Текущий раунд недоступен.' }
  }

  const question = getQuestionForRound(room, round)
  if (!question) {
    return { ok: false, error: 'Текущий раунд недоступен.' }
  }

  room.status = 'running'
  resolveRound(room, {
    type: 'skip',
    byName: hostName,
    answerIndex: null,
    correct: false,
    points: 0,
    elapsedMs: clamp(now() - room.roundStartedAt, 0, getRoundDurationMs(room)),
    expectedCorrectIndex: question.correctIndex,
  })

  return { ok: true }
}

io.on('connection', (socket) => {
  socket.on('host:createRoom', async (payload, callback) => {
    try {
      const pin = createUniquePin()
      const hostName = sanitizeName(payload?.hostName || 'Ведущий')
      const hostRejoinKey = generateHostRejoinKey()
      const theme = String(payload?.theme || 'Общая эрудиция').trim().slice(0, 80) || 'Общая эрудиция'
      const questionCount = pickQuestionCount(payload?.questionCount)
      const timerSeconds = clamp(Number(payload?.timerSeconds) || 30, 10, 60)
      const audience = pickAudience(payload?.audience)
      const tone = pickTone(payload?.tone)
      const aiMode = SERVER_AI_MODE
      const selectedModes = pickSelectedModes(payload?.selectedModes)
      const requestedFormat = pickGameFormat(payload?.format)
      const gameMode = pickGameMode(payload?.gameMode, requestedFormat)
      const gameModeConfig = gameModeCatalog[gameMode] || gameModeCatalog.team_battle
      const format = gameModeConfig.format
      const difficultyMode = pickDifficultyMode(payload?.difficultyMode)
      const speedBonusEnabled = gameModeConfig.forceSpeedBonus
        ? true
        : isSpeedBonusEnabled(payload?.speedBonusEnabled)
      const roomPassword = pickRoomPassword(payload?.roomPassword)

      const room = {
        pin,
        theme,
        format,
        difficultyMode,
        speedBonusEnabled,
        roomPassword,
        selectedModes,
        audience,
        tone,
        aiMode,
        gameMode,
        hostName,
        hostRejoinKey,
        questionCount,
        timerSeconds,
        createdAt: now(),
        finishedAt: null,
        status: 'lobby',
        provider: 'synthetic',
        hostSocketId: socket.id,
        hostGraceTimer: null,
        hostReconnectDeadlineAt: 0,
        playerReconnectSlots: new Map(),
        participants: new Map(),
        playerStats: {},
        teamMetrics: {
          A: { timeouts: 0, skips: 0 },
          B: { timeouts: 0, skips: 0 },
        },
        questionSets: {
          A: [],
          B: [],
        },
        questionBank: [],
        generationInFlight: null,
        generationError: '',
        playerScores: {},
        playerStreaks: {},
        rounds: [],
        roundIndex: -1,
        roundStartedAt: 0,
        roundDeadlineAt: 0,
        pausedRemainingMs: null,
        currentSubmission: null,
        teamVoteState: null,
        lastRoundSummary: null,
        roundHistory: [],
        scores: { A: 0, B: 0 },
        questionStats: {},
        timeline: [
          'Комната создана. Ожидание игроков.',
          `Профиль: ${audience.label}. Стиль: ${tone.label}. AI-режим сервера: ${aiMode}.`,
          `Режим матча: ${gameModeConfig.label}.`,
          `Режимы: ${selectedModes.map((modeId) => modeCatalog[modeId]).join(', ')}.`,
          `Формат: ${format === 'ffa' ? 'Все против всех' : 'Команды A/B'}.`,
          `Сложность: ${difficultyMode}. Бонус за скорость: ${speedBonusEnabled ? 'включен' : 'выключен'}.`,
          roomPassword ? 'Комната защищена паролем.' : 'Комната без пароля.',
        ],
        lastExport: null,
        exportInFlight: null,
        transitionTimer: null,
        persistedInDb: false,
      }

      room.participants.set(socket.id, buildHostParticipant(room, socket.id))

      rooms.set(pin, room)
      joinRoomSocket(socket, pin)
      emitRoomState(room)

      callback?.({ ok: true, pin, hostKey: hostRejoinKey })
    } catch {
      callback?.({ ok: false, error: 'Не удалось создать комнату.' })
    }
  })

  socket.on('player:joinRoom', (payload, callback) => {
    const pin = String(payload?.pin || '')
      .trim()
      .toUpperCase()
    const name = sanitizeName(payload?.name || 'Игрок')
    const incomingPlayerKey = normalizeRejoinKey(payload?.playerKey)
    const roomPassword = String(payload?.roomPassword || '').trim()
    const room = rooms.get(pin)

    if (!room) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    if (incomingPlayerKey && room.playerReconnectSlots.has(incomingPlayerKey)) {
      const slot = room.playerReconnectSlots.get(incomingPlayerKey)
      if (!slot) {
        callback?.({ ok: false, error: 'Не удалось восстановить подключение.' })
        return
      }

      clearPlayerReconnectSlot(room, incomingPlayerKey)

      const participant = {
        ...slot.participant,
        socketId: socket.id,
      }

      room.participants.set(socket.id, participant)
      ensureParticipantStat(room, participant)
      joinRoomSocket(socket, pin)
      room.timeline.unshift(`${participant.name} переподключился(ась) к игре.`)
      emitRoomState(room)
      callback?.({ ok: true, pin, playerKey: incomingPlayerKey, rejoined: true })
      return
    }

    if (room.status !== 'lobby') {
      callback?.({ ok: false, error: 'Подключение доступно только в лобби до старта игры.' })
      return
    }

    if (room.roomPassword && roomPassword !== room.roomPassword) {
      callback?.({ ok: false, error: 'Неверный пароль комнаты.' })
      return
    }

    if (isDuelMode(room)) {
      const players = getNonHostPlayers(room)
      if (players.length >= 2) {
        callback?.({ ok: false, error: 'Режим 1 на 1 уже заполнен. В этой комнате доступны только два игрока.' })
        return
      }
    }

    const duplicate = [...room.participants.values()].find(
      (participant) => !participant.isHost && participant.name.toLowerCase() === name.toLowerCase(),
    )

    const normalizedName = duplicate ? `${name}-${Math.floor(Math.random() * 90 + 10)}` : name

    const playerKey = incomingPlayerKey || generatePlayerRejoinKey()
    clearPlayerReconnectSlot(room, playerKey)

    const participant = {
      id: `p-${socket.id}`,
      socketId: socket.id,
      name: normalizedName,
      team: assignTeam(room),
      isHost: false,
      joinedAt: now(),
      playerKey,
      teamLocked: false,
    }

    room.participants.set(socket.id, participant)
    ensureParticipantStat(room, participant)

    joinRoomSocket(socket, pin)
    rebalanceTeamsInLobby(room)
    room.timeline.unshift(`${normalizedName} присоединился к игре.`)
    emitRoomState(room)

    callback?.({ ok: true, pin, playerKey, rejoined: false })
  })

  socket.on('player:switchTeam', (payload, callback) => {
    const pin = socketToRoom.get(socket.id)
    if (!pin) {
      callback?.({ ok: false, error: 'Сначала войдите в комнату.' })
      return
    }

    const room = rooms.get(pin)
    if (!room) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    if (room.format !== 'teams') {
      callback?.({ ok: false, error: 'Смена команды доступна только в командном режиме.' })
      return
    }

    if (room.status !== 'lobby') {
      callback?.({ ok: false, error: 'Команду можно сменить только в лобби.' })
      return
    }

    const me = room.participants.get(socket.id)
    if (!me || me.isHost) {
      callback?.({ ok: false, error: 'Только игрок может сменить команду.' })
      return
    }

    const targetTeam = String(payload?.team || '')
      .trim()
      .toUpperCase()
    if (targetTeam !== 'A' && targetTeam !== 'B') {
      callback?.({ ok: false, error: 'Некорректная команда.' })
      return
    }

    if (me.team === targetTeam) {
      callback?.({ ok: true, team: me.team })
      return
    }

    if (isDuelMode(room)) {
      const occupied = getNonHostPlayers(room).some((participant) => participant.id !== me.id && participant.team === targetTeam)
      if (occupied) {
        callback?.({ ok: false, error: `В дуэли 1 на 1 место в Команде ${targetTeam} уже занято.` })
        return
      }
    }

    me.team = targetTeam
    me.teamLocked = true
    ensureParticipantStat(room, me)
    room.timeline.unshift(`${me.name} перешел(а) в Команду ${targetTeam}.`)
    emitRoomState(room)
    callback?.({ ok: true, team: targetTeam })
  })

  socket.on('host:rejoinRoom', (payload, callback) => {
    const pin = String(payload?.pin || '')
      .trim()
      .toUpperCase()
    const hostKey = String(payload?.hostKey || '').trim()

    const room = rooms.get(pin)
    if (!room) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    if (!hostKey || room.hostRejoinKey !== hostKey) {
      callback?.({ ok: false, error: 'Недействительный ключ ведущего.' })
      return
    }

    if (room.hostSocketId) {
      callback?.({ ok: false, error: 'Ведущий уже подключен к комнате.' })
      return
    }

    clearHostReconnectGrace(room)
    room.hostSocketId = socket.id
    room.participants.set(socket.id, buildHostParticipant(room, socket.id))
    joinRoomSocket(socket, pin)

    room.timeline.unshift('Ведущий переподключился к комнате.')
    emitRoomState(room)

    callback?.({ ok: true, pin })
  })

  socket.on('host:startGame', async (_payload, callback) => {
    const pin = socketToRoom.get(socket.id)
    if (!pin) {
      callback?.({ ok: false, error: 'Сначала войдите в комнату.' })
      return
    }

    const room = rooms.get(pin)
    if (!room) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const me = room.participants.get(socket.id)
    if (!me?.isHost) {
      callback?.({ ok: false, error: 'Только ведущий может запустить игру.' })
      return
    }

    if (room.status === 'preparing' || room.status === 'running' || room.status === 'paused') {
      callback?.({ ok: false, error: 'Игра уже запущена.' })
      return
    }

    const players = getNonHostPlayers(room)
    if (players.length < 2) {
      callback?.({ ok: false, error: 'Для старта нужно минимум 2 игрока.' })
      return
    }

    if (isDuelMode(room)) {
      const population = teamPopulation(room)
      if (players.length !== 2 || population.A !== 1 || population.B !== 1) {
        callback?.({
          ok: false,
          error: 'Для режима 1 на 1 нужны ровно два игрока: один в Команде A и один в Команде B.',
        })
        return
      }
    }

    if (room.format === 'teams') {
      const population = teamPopulation(room)
      if (population.A < 1 || population.B < 1) {
        callback?.({ ok: false, error: 'Для командного режима нужны обе команды.' })
        return
      }
    }

    if (room.format === 'ffa' && players.length < 2) {
      callback?.({ ok: false, error: 'Для режима все против всех нужны минимум 2 игрока.' })
      return
    }

    clearHostReconnectGrace(room)
    clearAllPlayerReconnectSlots(room)
    room.status = 'preparing'
    room.timeline.unshift('Генерация вопросов...')
    emitRoomState(room)

    try {
      room.provider = 'synthetic'
      room.questionSets = { A: [], B: [] }
      room.questionBank = []
      room.generationError = ''
      room.playerScores = {}
      room.playerStreaks = {}
      players.forEach((participant) => {
        room.playerScores[participant.id] = 0
        room.playerStreaks[participant.id] = 0
      })
      if (room.format === 'ffa') {
        const order = [...players].sort((a, b) => a.joinedAt - b.joinedAt).map((player) => player.id)
        room.rounds = buildFfaRounds(room.questionCount, order)
      } else {
        room.rounds = buildRounds(room.questionCount)
      }
      room.roundIndex = -1
      room.roundStartedAt = 0
      room.roundDeadlineAt = 0
      room.pausedRemainingMs = null
      room.currentSubmission = null
      room.teamVoteState = null
      room.lastRoundSummary = null
      room.roundHistory = []
      room.finishedAt = null
      room.scores = { A: 0, B: 0 }
      room.teamMetrics = {
        A: { timeouts: 0, skips: 0 },
        B: { timeouts: 0, skips: 0 },
      }
      room.lastExport = null
      room.questionStats = {}
      room.persistedInDb = false
      room.playerStats = {}

      room.timeline.unshift('Генерация полного набора вопросов...')
      emitRoomState(room)

      await ensureFullQuestionSet(room)

      room.participants.forEach((participant) => {
        const stat = ensureParticipantStat(room, participant)
        if (!stat) return
        stat.answers = 0
        stat.correct = 0
        stat.wrong = 0
        stat.timeouts = 0
        stat.skips = 0
        stat.points = 0
        stat.leftAt = null
        stat.disqualified = false
      })
      room.timeline.unshift(`Вопросы готовы (${providerLabel[room.provider] || room.provider}). Игра стартовала.`)

      advanceRound(room)
      callback?.({ ok: true })
    } catch {
      room.status = 'lobby'
      room.timeline.unshift('Ошибка генерации вопросов.')
      emitRoomState(room)
      callback?.({ ok: false, error: 'Не удалось сгенерировать вопросы.' })
    }
  })

  socket.on('host:togglePause', (_payload, callback) => {
    const pin = socketToRoom.get(socket.id)
    if (!pin) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const room = rooms.get(pin)
    if (!room) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const me = room.participants.get(socket.id)
    if (!me?.isHost) {
      callback?.({ ok: false, error: 'Недостаточно прав.' })
      return
    }

    if (room.status === 'running') {
      room.pausedRemainingMs = Math.max(0, room.roundDeadlineAt - now())
      room.status = 'paused'
      room.timeline.unshift('Игра поставлена на паузу.')
      emitRoomState(room)
      callback?.({ ok: true, status: room.status })
      return
    }

    if (room.status === 'paused') {
      const round = getCurrentRound(room)
      const questionReady = Boolean(getQuestionForRound(room, round))

      if (!questionReady) {
        callback?.({ ok: false, error: 'Вопрос не найден. Перезапустите игру.' })
        return
      }

      room.status = 'running'
      room.roundDeadlineAt = now() + (room.pausedRemainingMs || getRoundDurationMs(room))
      room.timeline.unshift('Игра продолжена.')
      emitRoomState(room)
      callback?.({ ok: true, status: room.status })
      return
    }

    callback?.({ ok: false, error: 'Пауза доступна только во время игры.' })
  })

  socket.on('host:skipRound', (_payload, callback) => {
    const pin = socketToRoom.get(socket.id)
    if (!pin) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const room = rooms.get(pin)
    if (!room) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const me = room.participants.get(socket.id)
    if (!me?.isHost) {
      callback?.({ ok: false, error: 'Недостаточно прав.' })
      return
    }

    const result = skipRoundByHost(room, me.name)
    if (!result.ok) {
      callback?.(result)
      return
    }

    callback?.(result)
  })

  socket.on('host:nextRound', (_payload, callback) => {
    const pin = socketToRoom.get(socket.id)
    if (!pin) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const room = rooms.get(pin)
    if (!room) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const me = room.participants.get(socket.id)
    if (!me?.isHost) {
      callback?.({ ok: false, error: 'Недостаточно прав.' })
      return
    }

    const result = skipRoundByHost(room, me.name)
    if (!result.ok) {
      callback?.(result)
      return
    }

    room.timeline.unshift('Ведущий переключил игру на следующий вопрос.')
    emitRoomState(room)
    callback?.({ ok: true })
  })

  socket.on('host:kickPlayer', (payload, callback) => {
    const pin = socketToRoom.get(socket.id)
    if (!pin) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const room = rooms.get(pin)
    if (!room) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const me = room.participants.get(socket.id)
    if (!me?.isHost) {
      callback?.({ ok: false, error: 'Недостаточно прав.' })
      return
    }

    const targetId = String(payload?.participantId || '').trim()
    if (!targetId || targetId === 'host') {
      callback?.({ ok: false, error: 'Некорректный участник для дисквалификации.' })
      return
    }

    const targetEntry = [...room.participants.entries()].find(
      ([, participant]) => !participant.isHost && participant.id === targetId,
    )
    if (!targetEntry) {
      callback?.({ ok: false, error: 'Участник не найден.' })
      return
    }

    const [targetSocketId, participant] = targetEntry
    room.participants.delete(targetSocketId)
    markParticipantDisconnected(room, participant)
    clearPlayerReconnectSlot(room, participant.playerKey)
    socketToRoom.delete(targetSocketId)

    const stat = room.playerStats[participant.id]
    if (stat) {
      stat.disqualified = true
      stat.connected = false
      stat.leftAt = now()
    }

    if (room.playerScores[participant.id] !== undefined) {
      delete room.playerScores[participant.id]
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId)
    if (targetSocket) {
      targetSocket.leave(pin)
      io.to(targetSocketId).emit('room:closed', {
        pin,
        reason: 'Вас дисквалифицировал ведущий.',
      })
    }

    if (room.status === 'lobby') {
      rebalanceTeamsInLobby(room)
    }

    if (room.format === 'ffa' && room.status === 'running' && !room.currentSubmission) {
      const round = getCurrentRound(room)
      const question = getQuestionForRound(room, round)
      if (round?.playerId === participant.id) {
        resolveRound(room, {
          type: 'timeout',
          byName: participant.name,
          answerIndex: null,
          correct: false,
          points: 0,
          elapsedMs: clamp(now() - room.roundStartedAt, 0, getRoundDurationMs(room)),
          expectedCorrectIndex: question?.correctIndex ?? null,
        })
      }
    }

    if (room.format === 'teams' && room.status === 'running' && !room.currentSubmission) {
      void finalizeTeamRoundIfReady(room, 'all-voted')
    }

    room.timeline.unshift(`${participant.name} дисквалифицирован(а) ведущим.`)
    emitRoomState(room)
    callback?.({ ok: true })
  })

  socket.on('host:exportResults', async (_payload, callback) => {
    const pin = socketToRoom.get(socket.id)
    if (!pin) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const room = rooms.get(pin)
    if (!room) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const me = room.participants.get(socket.id)
    if (!me?.isHost) {
      callback?.({ ok: false, error: 'Недостаточно прав.' })
      return
    }

    if (room.status !== 'finished') {
      callback?.({ ok: false, error: 'Экспорт доступен после завершения игры.' })
      return
    }

    const result = await queueRoomExport(room, 'manual-host')
    if (!result) {
      callback?.({ ok: false, error: 'Не удалось сохранить файл.' })
      return
    }

    emitRoomState(room)
    callback?.({ ok: true, fileName: result.fileName, filePath: result.filePath })
  })

  socket.on('round:submitAnswer', (payload, callback) => {
    const pin = socketToRoom.get(socket.id)
    if (!pin) {
      callback?.({ ok: false, error: 'Комната не найдена.' })
      return
    }

    const room = rooms.get(pin)
    if (!room || room.status !== 'running') {
      callback?.({ ok: false, error: 'Игра сейчас недоступна для ответа.' })
      return
    }

    const me = room.participants.get(socket.id)
    if (!me || me.isHost) {
      callback?.({ ok: false, error: 'Только участники могут отвечать.' })
      return
    }

    const round = getCurrentRound(room)
    const question = getQuestionForRound(room, round)

    if (!round || !question) {
      callback?.({ ok: false, error: 'Текущий раунд не найден.' })
      return
    }

    if (room.currentSubmission) {
      callback?.({ ok: false, error: 'Ответ уже принят от команды.' })
      return
    }

    if (room.format === 'teams' && me.team !== round.team) {
      callback?.({ ok: false, error: 'Сейчас отвечает другая команда.' })
      return
    }

    if (room.format === 'ffa' && me.id !== round.playerId) {
      callback?.({ ok: false, error: 'Сейчас отвечает другой игрок.' })
      return
    }

    const wantsPass = payload?.pass === true || Number(payload?.answerIndex) === -1
    const rawAnswerIndex = Number(payload?.answerIndex)
    if (wantsPass && !isPassEnabled(room)) {
      callback?.({ ok: false, error: 'В выбранном режиме пас отключен.' })
      return
    }
    if (!wantsPass && (!Number.isInteger(rawAnswerIndex) || rawAnswerIndex < 0 || rawAnswerIndex > 3)) {
      callback?.({ ok: false, error: 'Выберите один из вариантов ответа.' })
      return
    }

    if (room.format === 'teams') {
      const voteState = ensureTeamVoteState(room, round.team)
      if (!voteState) {
        callback?.({ ok: false, error: 'Не удалось сохранить голос команды.' })
        return
      }

      if (voteState.votes[me.id]) {
        callback?.({ ok: false, error: 'Вы уже проголосовали в этом раунде.' })
        return
      }

      voteState.votes[me.id] = {
        answerIndex: wantsPass ? null : rawAnswerIndex,
        submittedAt: now(),
        byName: me.name,
      }

      if (!finalizeTeamRoundIfReady(room, 'all-voted')) {
        emitRoomState(room)
      }

      callback?.({ ok: true, accepted: true, voted: true })
      return
    }

    const elapsedMs = clamp(now() - room.roundStartedAt, 0, getRoundDurationMs(room))
    if (wantsPass) {
      const playerStat = ensureParticipantStat(room, me)
      if (playerStat) {
        playerStat.skips += 1
      }
      resolveRound(room, {
        type: 'pass',
        byName: me.name,
        answerIndex: null,
        correct: false,
        points: 0,
        elapsedMs,
        expectedCorrectIndex: question.correctIndex,
      })
      callback?.({ ok: true, accepted: true, voted: true })
      return
    }

    const answerIndex = rawAnswerIndex
    const correct = answerIndex === question.correctIndex

    let points = 0
    if (correct) {
      const score = scoreForAnswer(room, elapsedMs, question)
      points = score.base + score.bonus
      points += applyCorrectStreakBonus(room, me.id)
      room.playerScores[me.id] = Number(room.playerScores[me.id] || 0) + points
    } else {
      resetRoundActorStreak(room, round)
    }

    const submission = {
      type: 'answer',
      byName: me.name,
      answerIndex,
      correct,
      points,
      elapsedMs,
      expectedCorrectIndex: question.correctIndex,
    }

    const playerStat = ensureParticipantStat(room, me)
    if (playerStat) {
      playerStat.answers += 1
      if (correct) {
        playerStat.correct += 1
      } else {
        playerStat.wrong += 1
      }
      playerStat.points += points
    }

    resolveRound(room, submission)
    callback?.({ ok: true, accepted: true, voted: true })
  })

  socket.on('player:leaveRoom', (_payload, callback) => {
    const pin = socketToRoom.get(socket.id)
    if (!pin) {
      callback?.({ ok: true })
      return
    }

    const room = rooms.get(pin)
    if (!room) {
      socketToRoom.delete(socket.id)
      callback?.({ ok: true })
      return
    }

    const participant = room.participants.get(socket.id)
    room.participants.delete(socket.id)
    markParticipantDisconnected(room, participant)
    clearPlayerReconnectSlot(room, participant?.playerKey)
    if (participant?.id && room.playerScores[participant.id] !== undefined) {
      delete room.playerScores[participant.id]
    }
    socketToRoom.delete(socket.id)
    socket.leave(pin)

    if (participant?.isHost) {
      closeRoom(pin, 'Ведущий завершил сессию.')
      callback?.({ ok: true })
      return
    }

    room.timeline.unshift(`${participant?.name || 'Игрок'} покинул комнату.`)
    rebalanceTeamsInLobby(room)

    if (room.format === 'teams' && room.status === 'running' && !room.currentSubmission) {
      const finalized = finalizeTeamRoundIfReady(room, 'all-voted')
      if (finalized) {
        callback?.({ ok: true })
        return
      }
    }

    if (room.participants.size === 0) {
      rooms.delete(pin)
    } else {
      emitRoomState(room)
    }

    callback?.({ ok: true })
  })

  socket.on('disconnect', () => {
    const pin = socketToRoom.get(socket.id)
    if (!pin) return

    const room = rooms.get(pin)
    socketToRoom.delete(socket.id)

    if (!room) return

    const participant = room.participants.get(socket.id)
    room.participants.delete(socket.id)
    markParticipantDisconnected(room, participant)
    if (participant?.id && room.playerScores[participant.id] !== undefined) {
      delete room.playerScores[participant.id]
    }

    if (participant?.isHost) {
      startHostReconnectGrace(room, pin)
      return
    }

    if (!participant) {
      if (room.participants.size === 0 && room.playerReconnectSlots.size === 0) {
        rooms.delete(pin)
      } else {
        emitRoomState(room)
      }
      return
    }

    if (room.status === 'lobby' || room.status === 'finished') {
      room.timeline.unshift(`${participant.name} отключился.`)
      rebalanceTeamsInLobby(room)
      emitRoomState(room)
      if (room.participants.size === 0) rooms.delete(pin)
      return
    }

    startPlayerReconnectGrace(room, participant)

    if (room.format === 'teams' && room.status === 'running' && !room.currentSubmission) {
      if (finalizeTeamRoundIfReady(room, 'all-voted')) {
        return
      }
    }

    if (room.participants.size === 0 && room.playerReconnectSlots.size === 0) {
      rooms.delete(pin)
      return
    }

    emitRoomState(room)
  })
})

setInterval(() => {
  rooms.forEach((room) => {
    if (room.status === 'preparing') {
      emitRoomState(room)
      return
    }

    if (room.status === 'paused') {
      emitRoomState(room)
      return
    }

    if (room.status !== 'running') return
    const round = getCurrentRound(room)
    if (!round) return

    if (!room.currentSubmission && room.roundDeadlineAt > 0 && now() >= room.roundDeadlineAt) {
      if (room.format === 'teams' && finalizeTeamRoundIfReady(room, 'timeout')) {
        return
      }
      resolveRound(room, null)
      return
    }

    emitRoomState(room)
  })
}, 1000)

server.listen(PORT, () => {
  const root = path.resolve(process.cwd())
  console.log(`QuizBattle server listening on http://localhost:${PORT}`)
  console.log(`Workspace: ${root}`)
})
