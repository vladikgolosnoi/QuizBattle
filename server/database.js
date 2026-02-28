const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const Database = require('better-sqlite3')

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'quizbattle.db')
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

let db = null

const now = () => Date.now()

const normalizeUsername = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32)

const normalizeText = (value, max = 120) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

const normalizeLongText = (value, max = 480) => String(value || '').trim().slice(0, max)

const normalizeAvatarValue = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('data:image/')) {
    return raw.slice(0, 280000)
  }
  return raw.slice(0, 400)
}

const hashPassword = (password, salt) => crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex')

const hasColumn = (client, tableName, columnName) => {
  const rows = client.prepare(`PRAGMA table_info(${tableName})`).all()
  return rows.some((row) => row.name === columnName)
}

const ensureColumn = (client, tableName, columnName, definition) => {
  if (hasColumn(client, tableName, columnName)) return
  client.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

const ensureDb = () => {
  if (db) return db

  fs.mkdirSync(DATA_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      password_salt TEXT,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER,
      games_played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      total_points INTEGER NOT NULL DEFAULT 0,
      rating INTEGER NOT NULL DEFAULT 1000,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      nickname TEXT DEFAULT '',
      age INTEGER,
      activity TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      bio TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pin TEXT,
      theme TEXT,
      format TEXT,
      status TEXT,
      created_at INTEGER,
      finished_at INTEGER,
      winner TEXT,
      score_a INTEGER,
      score_b INTEGER,
      export_file TEXT,
      summary_json TEXT
    );

    CREATE TABLE IF NOT EXISTS game_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      team TEXT,
      points INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      wrong INTEGER NOT NULL DEFAULT 0,
      timeouts INTEGER NOT NULL DEFAULT 0,
      skips INTEGER NOT NULL DEFAULT 0,
      accuracy INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_low_id INTEGER NOT NULL,
      user_high_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      requested_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_low_id, user_high_id),
      FOREIGN KEY (user_low_id) REFERENCES users(id),
      FOREIGN KEY (user_high_id) REFERENCES users(id),
      FOREIGN KEY (requested_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS game_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      pin TEXT NOT NULL,
      theme TEXT DEFAULT '',
      message TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_low_id INTEGER NOT NULL,
      user_high_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message_at INTEGER,
      UNIQUE(user_low_id, user_high_id),
      FOREIGN KEY (user_low_id) REFERENCES users(id),
      FOREIGN KEY (user_high_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id),
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_players_username ON game_players(username);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_friendships_low_high ON friendships(user_low_id, user_high_id);
    CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);
    CREATE INDEX IF NOT EXISTS idx_game_invites_to_user ON game_invites(to_user_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_game_invites_from_user ON game_invites(from_user_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_low_high ON chat_threads(user_low_id, user_high_id);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_last_message ON chat_threads(last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_to_user_read ON chat_messages(to_user_id, read_at, id DESC);
  `)

  ensureColumn(db, 'users', 'first_name', "TEXT DEFAULT ''")
  ensureColumn(db, 'users', 'last_name', "TEXT DEFAULT ''")
  ensureColumn(db, 'users', 'nickname', "TEXT DEFAULT ''")
  ensureColumn(db, 'users', 'age', 'INTEGER')
  ensureColumn(db, 'users', 'activity', "TEXT DEFAULT ''")
  ensureColumn(db, 'users', 'avatar_url', "TEXT DEFAULT ''")
  ensureColumn(db, 'users', 'bio', "TEXT DEFAULT ''")
  ensureColumn(db, 'games', 'summary_json', 'TEXT')

  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(now())

  return db
}

const buildDisplayName = (user) => {
  const nickname = normalizeText(user?.nickname, 40)
  if (nickname) return nickname
  const firstName = normalizeText(user?.first_name, 40)
  const lastName = normalizeText(user?.last_name, 40)
  const full = [firstName, lastName].filter(Boolean).join(' ')
  return full || String(user?.username || '')
}

const serializeUser = (user) => {
  if (!user) return null

  const firstName = normalizeText(user.first_name, 40)
  const lastName = normalizeText(user.last_name, 40)
  const nickname = normalizeText(user.nickname, 40)
  const activity = normalizeText(user.activity, 80)
  const age = Number.isInteger(user.age) ? user.age : null

  const requiredFieldsFilled =
    firstName.length > 0 &&
    lastName.length > 0 &&
    nickname.length > 0 &&
    Number.isInteger(age) &&
    age >= 8 &&
    age <= 120 &&
    activity.length > 0

  return {
    id: user.id,
    username: user.username,
    displayName: buildDisplayName(user),
    firstName,
    lastName,
    nickname,
    age,
    activity,
    avatarUrl: normalizeAvatarValue(user.avatar_url),
    bio: normalizeLongText(user.bio, 280),
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    gamesPlayed: user.games_played,
    wins: user.wins,
    totalPoints: user.total_points,
    rating: user.rating,
    profileCompleted: requiredFieldsFilled,
  }
}

const getUserById = (id) => {
  const client = ensureDb()
  return client.prepare('SELECT * FROM users WHERE id = ?').get(Number(id)) || null
}

const getUserByName = (username) => {
  const safe = normalizeUsername(username)
  if (!safe) return null
  const client = ensureDb()
  return client.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(safe) || null
}

const makePair = (userAId, userBId) => {
  const a = Number(userAId)
  const b = Number(userBId)
  return {
    low: Math.min(a, b),
    high: Math.max(a, b),
  }
}

const sanitizeProfilePayload = (payload, fallbackUsername = '') => {
  const firstName = normalizeText(payload?.firstName, 40) || normalizeText(fallbackUsername, 40)
  const lastName = normalizeText(payload?.lastName, 40)
  const nickname = normalizeText(payload?.nickname, 40) || normalizeText(fallbackUsername, 40)
  const ageRaw = Number(payload?.age)
  const age = Number.isInteger(ageRaw) && ageRaw >= 8 && ageRaw <= 120 ? ageRaw : null
  const activity = normalizeText(payload?.activity, 80)
  const avatarUrl = normalizeAvatarValue(payload?.avatarUrl)
  const bio = normalizeLongText(payload?.bio, 280)

  return {
    firstName,
    lastName,
    nickname,
    age,
    activity,
    avatarUrl,
    bio,
  }
}

const createSession = (userId, userAgent = '') => {
  const client = ensureDb()
  const createdAt = now()
  const expiresAt = createdAt + SESSION_TTL_MS
  const token = crypto.randomBytes(32).toString('base64url')

  client.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(createdAt)
  client
    .prepare('INSERT INTO auth_sessions (user_id, token, created_at, expires_at, last_used_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
    .run(Number(userId), token, createdAt, expiresAt, createdAt, normalizeText(userAgent, 180))

  return token
}

const getSessionUser = (token) => {
  const safeToken = String(token || '').trim()
  if (!safeToken) return null

  const client = ensureDb()
  const record =
    client
      .prepare(
        `SELECT s.id AS session_id, s.user_id AS user_id, s.expires_at AS expires_at, u.*
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?
         LIMIT 1`,
      )
      .get(safeToken) || null

  if (!record) return null
  if (Number(record.expires_at) < now()) {
    client.prepare('DELETE FROM auth_sessions WHERE id = ?').run(record.session_id)
    return null
  }

  client.prepare('UPDATE auth_sessions SET last_used_at = ? WHERE id = ?').run(now(), record.session_id)
  return record
}

const logoutSession = (token) => {
  const safeToken = String(token || '').trim()
  if (!safeToken) return
  const client = ensureDb()
  client.prepare('DELETE FROM auth_sessions WHERE token = ?').run(safeToken)
}

const ensureUser = (username) => {
  const safe = normalizeUsername(username)
  if (!safe) return null

  const client = ensureDb()
  const existing = getUserByName(safe)
  if (existing) return existing

  const profile = sanitizeProfilePayload(
    {
      firstName: safe,
      nickname: safe,
      activity: 'Игрок QuizBattle',
    },
    safe,
  )

  client
    .prepare(
      `INSERT INTO users (
        username, password_hash, password_salt, created_at, last_login_at, games_played, wins, total_points, rating,
        first_name, last_name, nickname, age, activity, avatar_url, bio
      ) VALUES (?, NULL, NULL, ?, NULL, 0, 0, 0, 1000, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      safe,
      now(),
      profile.firstName,
      profile.lastName,
      profile.nickname,
      profile.age,
      profile.activity,
      profile.avatarUrl,
      profile.bio,
    )

  return getUserByName(safe)
}

const registerUser = ({ username, password, profile, userAgent }) => {
  const safeUsername = normalizeUsername(username)
  const safePassword = String(password || '')
  const safeProfile = sanitizeProfilePayload(profile || {}, safeUsername)

  if (safeUsername.length < 2) {
    return { ok: false, error: 'Имя пользователя слишком короткое.' }
  }

  if (safePassword.length < 6) {
    return { ok: false, error: 'Пароль должен быть не короче 6 символов.' }
  }

  if (!safeProfile.firstName || !safeProfile.nickname || !safeProfile.activity || !safeProfile.age) {
    return { ok: false, error: 'Заполните профиль: имя, ник, возраст и сферу деятельности.' }
  }

  const client = ensureDb()
  const existing = getUserByName(safeUsername)
  if (existing && existing.password_hash) {
    return { ok: false, error: 'Пользователь уже зарегистрирован.' }
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(safePassword, salt)
  const createdAt = now()

  if (existing) {
    client
      .prepare(
        `UPDATE users
         SET password_hash = ?, password_salt = ?, created_at = ?, first_name = ?, last_name = ?, nickname = ?, age = ?, activity = ?, avatar_url = ?, bio = ?
         WHERE id = ?`,
      )
      .run(
        passwordHash,
        salt,
        createdAt,
        safeProfile.firstName,
        safeProfile.lastName,
        safeProfile.nickname,
        safeProfile.age,
        safeProfile.activity,
        safeProfile.avatarUrl,
        safeProfile.bio,
        existing.id,
      )
  } else {
    client
      .prepare(
        `INSERT INTO users (
          username, password_hash, password_salt, created_at, last_login_at, games_played, wins, total_points, rating,
          first_name, last_name, nickname, age, activity, avatar_url, bio
        ) VALUES (?, ?, ?, ?, NULL, 0, 0, 0, 1000, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        safeUsername,
        passwordHash,
        salt,
        createdAt,
        safeProfile.firstName,
        safeProfile.lastName,
        safeProfile.nickname,
        safeProfile.age,
        safeProfile.activity,
        safeProfile.avatarUrl,
        safeProfile.bio,
      )
  }

  const registered = getUserByName(safeUsername)
  const token = createSession(registered.id, userAgent)
  return { ok: true, token, profile: serializeUser(registered) }
}

const loginUser = ({ username, password, userAgent }) => {
  const safeUsername = normalizeUsername(username)
  const safePassword = String(password || '')

  const user = getUserByName(safeUsername)
  if (!user || !user.password_hash || !user.password_salt) {
    return { ok: false, error: 'Пользователь не найден или не зарегистрирован.' }
  }

  const computed = hashPassword(safePassword, user.password_salt)
  if (computed !== user.password_hash) {
    return { ok: false, error: 'Неверный пароль.' }
  }

  const loginAt = now()
  const client = ensureDb()
  client.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(loginAt, user.id)
  const token = createSession(user.id, userAgent)
  return { ok: true, token, profile: serializeUser(getUserByName(safeUsername)) }
}

const getAuthProfile = (token) => {
  const sessionUser = getSessionUser(token)
  if (!sessionUser) return null
  return serializeUser(sessionUser)
}

const updateProfileByToken = (token, payload) => {
  const sessionUser = getSessionUser(token)
  if (!sessionUser) {
    return { ok: false, error: 'Требуется авторизация.' }
  }

  const nextProfile = sanitizeProfilePayload(payload || {}, sessionUser.username)
  if (!nextProfile.firstName || !nextProfile.nickname || !nextProfile.activity || !nextProfile.age) {
    return { ok: false, error: 'Поля имя, ник, возраст и сфера деятельности обязательны.' }
  }

  const client = ensureDb()
  client
    .prepare(
      `UPDATE users
       SET first_name = ?, last_name = ?, nickname = ?, age = ?, activity = ?, avatar_url = ?, bio = ?
       WHERE id = ?`,
    )
    .run(
      nextProfile.firstName,
      nextProfile.lastName,
      nextProfile.nickname,
      nextProfile.age,
      nextProfile.activity,
      nextProfile.avatarUrl,
      nextProfile.bio,
      sessionUser.id,
    )

  return { ok: true, profile: serializeUser(getUserById(sessionUser.id)) }
}

const computeRatingDelta = ({ points, correct, wrong, timeouts, skips, isWinner }) => {
  let delta = 0
  delta += Number(points || 0) * 4
  delta += Number(correct || 0) * 6
  delta -= Number(wrong || 0) * 2
  delta -= Number(timeouts || 0)
  delta -= Number(skips || 0)
  if (isWinner) delta += 30
  return Math.round(delta)
}

const persistFinishedGame = (summary) => {
  const client = ensureDb()
  const safeSummary = summary || {}
  const players = Array.isArray(safeSummary.players) ? safeSummary.players : []
  if (players.length === 0) return

  const summaryJson = JSON.stringify(safeSummary)

  const tx = client.transaction(() => {
    const insertGame = client.prepare(
      'INSERT INTO games (pin, theme, format, status, created_at, finished_at, winner, score_a, score_b, export_file, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const gameResult = insertGame.run(
      String(safeSummary.pin || ''),
      String(safeSummary.theme || ''),
      String(safeSummary.format || 'teams'),
      String(safeSummary.status || 'finished'),
      Number(safeSummary.createdAt || 0),
      Number(safeSummary.finishedAt || now()),
      String(safeSummary.winner || 'draw'),
      Number(safeSummary.scoreA || 0),
      Number(safeSummary.scoreB || 0),
      String(safeSummary.exportFile || ''),
      summaryJson,
    )

    const gameId = Number(gameResult.lastInsertRowid)
    const insertGamePlayer = client.prepare(
      'INSERT INTO game_players (game_id, username, team, points, correct, wrong, timeouts, skips, accuracy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )

    const updateUser = client.prepare(
      'UPDATE users SET games_played = games_played + 1, wins = wins + ?, total_points = total_points + ?, rating = rating + ? WHERE username = ? COLLATE NOCASE',
    )

    players.forEach((player) => {
      const username = normalizeUsername(player?.name)
      if (!username) return

      ensureUser(username)

      const points = Number(player?.points || 0)
      const correct = Number(player?.correct || 0)
      const wrong = Number(player?.wrong || 0)
      const timeouts = Number(player?.timeouts || 0)
      const skips = Number(player?.skips || 0)
      const accuracy = Number(player?.accuracy || 0)
      const team = String(player?.team || '')
      const isWinner = Boolean(player?.isWinner)

      insertGamePlayer.run(gameId, username, team, points, correct, wrong, timeouts, skips, accuracy)

      const delta = computeRatingDelta({
        points,
        correct,
        wrong,
        timeouts,
        skips,
        isWinner,
      })

      updateUser.run(isWinner ? 1 : 0, points, delta, username)
    })
  })

  tx()
}

const getLeaderboard = (limit = 20) => {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20))
  const client = ensureDb()
  return client
    .prepare(
      `SELECT username, nickname, first_name AS firstName, last_name AS lastName, avatar_url AS avatarUrl,
              rating, wins, games_played AS gamesPlayed, total_points AS totalPoints
       FROM users
       WHERE password_hash IS NOT NULL
       ORDER BY rating DESC, total_points DESC, wins DESC
       LIMIT ?`,
    )
    .all(safeLimit)
    .map((row) => ({
      ...row,
      displayName: normalizeText(row.nickname, 40) || normalizeText(row.username, 40),
      avatarUrl: normalizeAvatarValue(row.avatarUrl),
    }))
}

const getRecentGames = (limit = 15) => {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 15))
  const client = ensureDb()

  return client
    .prepare(
      `SELECT g.id, g.pin, g.theme, g.format, g.status, g.created_at AS createdAt, g.finished_at AS finishedAt, g.winner,
              g.score_a AS scoreA, g.score_b AS scoreB, g.export_file AS exportFile,
              (SELECT COUNT(*) FROM game_players gp WHERE gp.game_id = g.id) AS participants
       FROM games g
       ORDER BY g.finished_at DESC, g.id DESC
       LIMIT ?`,
    )
    .all(safeLimit)
}

const getGameDetails = (gameId) => {
  const safeId = Number(gameId)
  if (!Number.isInteger(safeId) || safeId <= 0) return null

  const client = ensureDb()
  const game =
    client
      .prepare(
        `SELECT id, pin, theme, format, status, created_at AS createdAt, finished_at AS finishedAt, winner,
                score_a AS scoreA, score_b AS scoreB, export_file AS exportFile, summary_json AS summaryJson
         FROM games
         WHERE id = ?`,
      )
      .get(safeId) || null

  if (!game) return null

  const players = client
    .prepare(
      `SELECT gp.username, gp.team, gp.points, gp.correct, gp.wrong, gp.timeouts, gp.skips, gp.accuracy,
              u.nickname AS nickname, u.avatar_url AS avatarUrl, u.first_name AS firstName, u.last_name AS lastName
       FROM game_players gp
       LEFT JOIN users u ON u.username = gp.username COLLATE NOCASE
       WHERE gp.game_id = ?
       ORDER BY gp.points DESC, gp.correct DESC, gp.username ASC`,
    )
    .all(safeId)
    .map((row) => ({
      username: row.username,
      displayName: normalizeText(row.nickname, 40) || normalizeText(row.username, 40),
      avatarUrl: normalizeAvatarValue(row.avatarUrl),
      firstName: normalizeText(row.firstName, 40),
      lastName: normalizeText(row.lastName, 40),
      team: row.team,
      points: row.points,
      correct: row.correct,
      wrong: row.wrong,
      timeouts: row.timeouts,
      skips: row.skips,
      accuracy: row.accuracy,
    }))

  let summary = null
  if (game.summaryJson) {
    try {
      summary = JSON.parse(game.summaryJson)
    } catch {
      summary = null
    }
  }

  return {
    game: {
      ...game,
      summaryJson: undefined,
    },
    players,
    summary,
  }
}

const getFriendshipRecord = (userAId, userBId) => {
  const { low, high } = makePair(userAId, userBId)
  const client = ensureDb()
  return client.prepare('SELECT * FROM friendships WHERE user_low_id = ? AND user_high_id = ? LIMIT 1').get(low, high) || null
}

const resolveFriendshipStatus = (viewerId, targetId) => {
  const a = Number(viewerId)
  const b = Number(targetId)
  if (!a || !b) return 'none'
  if (a === b) return 'self'
  const record = getFriendshipRecord(a, b)
  if (!record) return 'none'
  if (record.status === 'accepted') return 'accepted'
  if (record.status === 'pending') {
    return Number(record.requested_by) === a ? 'pending_outgoing' : 'pending_incoming'
  }
  return 'none'
}

const countAcceptedFriends = (userId) => {
  const client = ensureDb()
  const row = client
    .prepare('SELECT COUNT(*) AS total FROM friendships WHERE status = ? AND (user_low_id = ? OR user_high_id = ?)')
    .get('accepted', Number(userId), Number(userId))
  return Number(row?.total || 0)
}

const computeAchievements = (profile, games, friendsCount = 0) => {
  const maxAccuracy = games.reduce((best, item) => Math.max(best, Number(item?.accuracy || 0)), 0)
  const definitions = [
    {
      key: 'starter',
      title: 'Первый матч',
      description: 'Сыграйте первую игру',
      value: Number(profile.gamesPlayed || 0),
      target: 1,
    },
    {
      key: 'winner',
      title: 'Первая победа',
      description: 'Победите хотя бы в одном матче',
      value: Number(profile.wins || 0),
      target: 1,
    },
    {
      key: 'strategist',
      title: 'Стратег',
      description: 'Поднимите рейтинг до 1200',
      value: Number(profile.rating || 0),
      target: 1200,
    },
    {
      key: 'accuracy_80',
      title: 'Снайпер',
      description: 'Достигните точности 80% в одном матче',
      value: maxAccuracy,
      target: 80,
    },
    {
      key: 'socializer',
      title: 'Командный игрок',
      description: 'Добавьте 3 друзей',
      value: Number(friendsCount || 0),
      target: 3,
    },
    {
      key: 'veteran',
      title: 'Ветеран',
      description: 'Сыграйте 25 матчей',
      value: Number(profile.gamesPlayed || 0),
      target: 25,
    },
  ]

  return definitions.map((item) => {
    const progress = Math.max(0, Math.min(item.target, item.value))
    return {
      key: item.key,
      title: item.title,
      description: item.description,
      unlocked: item.value >= item.target,
      progress,
      target: item.target,
    }
  })
}

const getProfileWithGames = (username, limit = 15, viewerToken = '') => {
  const safeUsername = normalizeUsername(username)
  if (!safeUsername) return null

  const user = getUserByName(safeUsername)
  if (!user) return null

  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 15))
  const client = ensureDb()

  const games = client
    .prepare(
      `SELECT g.id, g.pin, g.theme, g.format, g.finished_at AS finishedAt, g.winner, g.score_a AS scoreA, g.score_b AS scoreB,
              gp.team, gp.points, gp.correct, gp.wrong, gp.timeouts, gp.skips, gp.accuracy
       FROM game_players gp
       JOIN games g ON g.id = gp.game_id
       WHERE gp.username = ? COLLATE NOCASE
       ORDER BY g.finished_at DESC, g.id DESC
       LIMIT ?`,
    )
    .all(safeUsername, safeLimit)

  const viewer = getSessionUser(viewerToken)
  const friendsCount = countAcceptedFriends(user.id)
  const profile = serializeUser(user)

  return {
    profile,
    games,
    social: {
      friendsCount,
    },
    achievements: computeAchievements(profile, games, friendsCount),
    friendshipStatus: viewer ? resolveFriendshipStatus(viewer.id, user.id) : 'none',
  }
}

const searchUsers = (query, token, limit = 15) => {
  const viewer = getSessionUser(token)
  if (!viewer) return { ok: false, error: 'Требуется авторизация.' }

  const safeQuery = normalizeText(query, 60)
  if (safeQuery.length < 2) return { ok: true, items: [] }

  const safeLimit = Math.min(30, Math.max(1, Number(limit) || 15))
  const client = ensureDb()
  const mask = `%${safeQuery}%`
  const rows = client
    .prepare(
      `SELECT *
       FROM users
       WHERE id != ?
         AND (username LIKE ? COLLATE NOCASE OR nickname LIKE ? COLLATE NOCASE OR first_name LIKE ? COLLATE NOCASE OR last_name LIKE ? COLLATE NOCASE)
       ORDER BY rating DESC, username ASC
       LIMIT ?`,
    )
    .all(viewer.id, mask, mask, mask, mask, safeLimit)

  return {
    ok: true,
    items: rows.map((row) => ({
      ...serializeUser(row),
      friendshipStatus: resolveFriendshipStatus(viewer.id, row.id),
    })),
  }
}

const sendFriendRequest = (token, targetUsername) => {
  const viewer = getSessionUser(token)
  if (!viewer) return { ok: false, error: 'Требуется авторизация.' }

  const target = getUserByName(targetUsername)
  if (!target) return { ok: false, error: 'Пользователь не найден.' }
  if (viewer.id === target.id) return { ok: false, error: 'Нельзя добавить себя в друзья.' }

  const client = ensureDb()
  const { low, high } = makePair(viewer.id, target.id)
  const existing = getFriendshipRecord(viewer.id, target.id)
  const ts = now()

  if (!existing) {
    client
      .prepare(
        'INSERT INTO friendships (user_low_id, user_high_id, status, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(low, high, 'pending', viewer.id, ts, ts)
    return { ok: true, status: 'pending_outgoing' }
  }

  if (existing.status === 'accepted') {
    return { ok: false, error: 'Вы уже друзья.' }
  }

  if (existing.status === 'pending') {
    if (Number(existing.requested_by) === Number(viewer.id)) {
      return { ok: false, error: 'Заявка уже отправлена.' }
    }
    client
      .prepare('UPDATE friendships SET status = ?, requested_by = ?, updated_at = ? WHERE id = ?')
      .run('accepted', viewer.id, ts, existing.id)
    return { ok: true, status: 'accepted' }
  }

  client
    .prepare('UPDATE friendships SET status = ?, requested_by = ?, updated_at = ? WHERE id = ?')
    .run('pending', viewer.id, ts, existing.id)

  return { ok: true, status: 'pending_outgoing' }
}

const respondFriendRequest = (token, requestId, action) => {
  const viewer = getSessionUser(token)
  if (!viewer) return { ok: false, error: 'Требуется авторизация.' }

  const safeAction = String(action || '').trim().toLowerCase()
  if (!['accept', 'decline'].includes(safeAction)) {
    return { ok: false, error: 'Некорректное действие.' }
  }

  const safeRequestId = Number(requestId)
  if (!Number.isInteger(safeRequestId) || safeRequestId <= 0) {
    return { ok: false, error: 'Некорректный запрос.' }
  }

  const client = ensureDb()
  const request =
    client
      .prepare('SELECT * FROM friendships WHERE id = ? AND status = ? LIMIT 1')
      .get(safeRequestId, 'pending') || null
  if (!request) return { ok: false, error: 'Заявка не найдена.' }

  const isParticipant = Number(request.user_low_id) === Number(viewer.id) || Number(request.user_high_id) === Number(viewer.id)
  if (!isParticipant) return { ok: false, error: 'Нет доступа к заявке.' }
  if (Number(request.requested_by) === Number(viewer.id)) {
    return { ok: false, error: 'Нельзя принять собственную заявку.' }
  }

  const nextStatus = safeAction === 'accept' ? 'accepted' : 'rejected'
  client.prepare('UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, now(), safeRequestId)
  return { ok: true, status: nextStatus }
}

const getFriendsOverview = (token) => {
  const viewer = getSessionUser(token)
  if (!viewer) return { ok: false, error: 'Требуется авторизация.' }

  const client = ensureDb()

  const friends = client
    .prepare(
      `SELECT f.id AS requestId, f.updated_at AS updatedAt, u.*
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_low_id = ? THEN f.user_high_id ELSE f.user_low_id END
       WHERE (f.user_low_id = ? OR f.user_high_id = ?)
         AND f.status = 'accepted'
       ORDER BY u.rating DESC, u.username ASC`,
    )
    .all(viewer.id, viewer.id, viewer.id)
    .map((row) => ({
      ...serializeUser(row),
      friendshipStatus: 'accepted',
      requestId: row.requestId,
      since: row.updatedAt,
    }))

  const incoming = client
    .prepare(
      `SELECT f.id AS requestId, f.created_at AS createdAt, u.*
       FROM friendships f
       JOIN users u ON u.id = f.requested_by
       WHERE (f.user_low_id = ? OR f.user_high_id = ?)
         AND f.status = 'pending'
         AND f.requested_by != ?
       ORDER BY f.created_at DESC`,
    )
    .all(viewer.id, viewer.id, viewer.id)
    .map((row) => ({
      ...serializeUser(row),
      friendshipStatus: 'pending_incoming',
      requestId: row.requestId,
      createdAt: row.createdAt,
    }))

  const outgoing = client
    .prepare(
      `SELECT f.id AS requestId, f.created_at AS createdAt, u.*
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_low_id = ? THEN f.user_high_id ELSE f.user_low_id END
       WHERE (f.user_low_id = ? OR f.user_high_id = ?)
         AND f.status = 'pending'
         AND f.requested_by = ?
       ORDER BY f.created_at DESC`,
    )
    .all(viewer.id, viewer.id, viewer.id, viewer.id)
    .map((row) => ({
      ...serializeUser(row),
      friendshipStatus: 'pending_outgoing',
      requestId: row.requestId,
      createdAt: row.createdAt,
    }))

  return {
    ok: true,
    me: serializeUser(viewer),
    friends,
    incoming,
    outgoing,
  }
}

const sendGameInvite = (token, targetUsername, payload = {}) => {
  const viewer = getSessionUser(token)
  if (!viewer) return { ok: false, error: 'Требуется авторизация.' }

  const target = getUserByName(targetUsername)
  if (!target) return { ok: false, error: 'Пользователь не найден.' }
  if (viewer.id === target.id) return { ok: false, error: 'Нельзя отправить приглашение себе.' }

  const friendshipStatus = resolveFriendshipStatus(viewer.id, target.id)
  if (friendshipStatus !== 'accepted') {
    return { ok: false, error: 'Приглашать в игру можно только друзей.' }
  }

  const pin = String(payload.pin || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10)
  if (pin.length < 4) {
    return { ok: false, error: 'Укажите PIN комнаты.' }
  }

  const theme = normalizeText(payload.theme, 80)
  const message = normalizeLongText(payload.message, 240)
  const ts = now()

  const client = ensureDb()
  client
    .prepare(
      'INSERT INTO game_invites (from_user_id, to_user_id, pin, theme, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(viewer.id, target.id, pin, theme, message, 'pending', ts, ts)

  return { ok: true }
}

const getGameInvites = (token, limit = 20) => {
  const viewer = getSessionUser(token)
  if (!viewer) return { ok: false, error: 'Требуется авторизация.' }
  const safeLimit = Math.min(60, Math.max(1, Number(limit) || 20))

  const client = ensureDb()
  const incoming = client
    .prepare(
      `SELECT gi.id, gi.pin, gi.theme, gi.message, gi.status, gi.created_at AS createdAt, gi.updated_at AS updatedAt,
              u.username, u.nickname, u.avatar_url AS avatarUrl, u.first_name AS firstName, u.last_name AS lastName
       FROM game_invites gi
       JOIN users u ON u.id = gi.from_user_id
       WHERE gi.to_user_id = ?
       ORDER BY gi.created_at DESC
       LIMIT ?`,
    )
    .all(viewer.id, safeLimit)
    .map((row) => ({
      id: row.id,
      pin: row.pin,
      theme: row.theme,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      from: {
        username: row.username,
        displayName: normalizeText(row.nickname, 40) || normalizeText(row.username, 40),
        avatarUrl: normalizeAvatarValue(row.avatarUrl),
        firstName: normalizeText(row.firstName, 40),
        lastName: normalizeText(row.lastName, 40),
      },
    }))

  const outgoing = client
    .prepare(
      `SELECT gi.id, gi.pin, gi.theme, gi.message, gi.status, gi.created_at AS createdAt, gi.updated_at AS updatedAt,
              u.username, u.nickname, u.avatar_url AS avatarUrl, u.first_name AS firstName, u.last_name AS lastName
       FROM game_invites gi
       JOIN users u ON u.id = gi.to_user_id
       WHERE gi.from_user_id = ?
       ORDER BY gi.created_at DESC
       LIMIT ?`,
    )
    .all(viewer.id, safeLimit)
    .map((row) => ({
      id: row.id,
      pin: row.pin,
      theme: row.theme,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      to: {
        username: row.username,
        displayName: normalizeText(row.nickname, 40) || normalizeText(row.username, 40),
        avatarUrl: normalizeAvatarValue(row.avatarUrl),
        firstName: normalizeText(row.firstName, 40),
        lastName: normalizeText(row.lastName, 40),
      },
    }))

  return { ok: true, incoming, outgoing }
}

const respondGameInvite = (token, inviteId, action) => {
  const viewer = getSessionUser(token)
  if (!viewer) return { ok: false, error: 'Требуется авторизация.' }

  const safeInviteId = Number(inviteId)
  if (!Number.isInteger(safeInviteId) || safeInviteId <= 0) {
    return { ok: false, error: 'Некорректное приглашение.' }
  }

  const safeAction = String(action || '').trim().toLowerCase()
  if (!['accept', 'decline'].includes(safeAction)) {
    return { ok: false, error: 'Некорректное действие.' }
  }

  const client = ensureDb()
  const invite =
    client
      .prepare('SELECT * FROM game_invites WHERE id = ? LIMIT 1')
      .get(safeInviteId) || null
  if (!invite) return { ok: false, error: 'Приглашение не найдено.' }
  if (Number(invite.to_user_id) !== Number(viewer.id)) {
    return { ok: false, error: 'Нет доступа к приглашению.' }
  }

  const nextStatus = safeAction === 'accept' ? 'accepted' : 'declined'
  client.prepare('UPDATE game_invites SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, now(), safeInviteId)
  return { ok: true, status: nextStatus }
}

const getOrCreateThread = (client, userAId, userBId) => {
  const { low, high } = makePair(userAId, userBId)
  const existing =
    client
      .prepare('SELECT id, user_low_id AS userLowId, user_high_id AS userHighId FROM chat_threads WHERE user_low_id = ? AND user_high_id = ? LIMIT 1')
      .get(low, high) || null
  if (existing) return existing

  const ts = now()
  const created = client
    .prepare('INSERT INTO chat_threads (user_low_id, user_high_id, created_at, updated_at, last_message_at) VALUES (?, ?, ?, ?, NULL)')
    .run(low, high, ts, ts)

  return {
    id: Number(created.lastInsertRowid),
    userLowId: low,
    userHighId: high,
  }
}

const getChatList = (token, limit = 20) => {
  const viewer = getSessionUser(token)
  if (!viewer) return { ok: false, error: 'Требуется авторизация.' }
  const safeLimit = Math.min(80, Math.max(1, Number(limit) || 20))
  const client = ensureDb()

  const rows = client
    .prepare(
      `SELECT ct.id AS threadId, ct.updated_at AS updatedAt, ct.last_message_at AS lastMessageAt,
              u.*,
              lm.id AS lastMessageId, lm.message AS lastMessageText, lm.created_at AS lastMessageCreatedAt, lm.from_user_id AS lastMessageFromUserId,
              (
                SELECT COUNT(*)
                FROM chat_messages unread
                WHERE unread.thread_id = ct.id
                  AND unread.to_user_id = ?
                  AND unread.read_at IS NULL
              ) AS unreadCount
       FROM chat_threads ct
       JOIN users u ON u.id = CASE WHEN ct.user_low_id = ? THEN ct.user_high_id ELSE ct.user_low_id END
       LEFT JOIN chat_messages lm ON lm.id = (
         SELECT id
         FROM chat_messages tail
         WHERE tail.thread_id = ct.id
         ORDER BY tail.id DESC
         LIMIT 1
       )
       WHERE ct.user_low_id = ? OR ct.user_high_id = ?
       ORDER BY COALESCE(ct.last_message_at, ct.updated_at) DESC
       LIMIT ?`,
    )
    .all(viewer.id, viewer.id, viewer.id, viewer.id, safeLimit)

  return {
    ok: true,
    items: rows.map((row) => ({
      threadId: row.threadId,
      updatedAt: row.updatedAt,
      unreadCount: Number(row.unreadCount || 0),
      peer: serializeUser(row),
      lastMessage: row.lastMessageId
        ? {
            id: row.lastMessageId,
            text: row.lastMessageText,
            createdAt: row.lastMessageCreatedAt,
            fromMe: Number(row.lastMessageFromUserId) === Number(viewer.id),
          }
        : null,
    })),
  }
}

const getChatMessages = (token, targetUsername, limit = 80) => {
  const viewer = getSessionUser(token)
  if (!viewer) return { ok: false, error: 'Требуется авторизация.' }
  const target = getUserByName(targetUsername)
  if (!target) return { ok: false, error: 'Пользователь не найден.' }
  if (Number(target.id) === Number(viewer.id)) return { ok: false, error: 'Нельзя открыть чат с собой.' }

  const relation = resolveFriendshipStatus(viewer.id, target.id)
  if (relation !== 'accepted') {
    return { ok: false, error: 'Чат доступен только с друзьями.' }
  }

  const safeLimit = Math.min(300, Math.max(1, Number(limit) || 80))
  const client = ensureDb()
  const thread = getOrCreateThread(client, viewer.id, target.id)

  const messagesDesc = client
    .prepare(
      `SELECT id, from_user_id AS fromUserId, to_user_id AS toUserId, message, created_at AS createdAt, read_at AS readAt
       FROM chat_messages
       WHERE thread_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(thread.id, safeLimit)

  client
    .prepare(
      `UPDATE chat_messages
       SET read_at = ?
       WHERE thread_id = ?
         AND to_user_id = ?
         AND read_at IS NULL`,
    )
    .run(now(), thread.id, viewer.id)

  const messages = messagesDesc.reverse().map((item) => ({
    id: item.id,
    text: item.message,
    createdAt: item.createdAt,
    readAt: item.readAt,
    fromUserId: item.fromUserId,
    toUserId: item.toUserId,
    fromMe: Number(item.fromUserId) === Number(viewer.id),
  }))

  return {
    ok: true,
    threadId: thread.id,
    peer: serializeUser(target),
    messages,
  }
}

const sendChatMessage = (token, targetUsername, text) => {
  const viewer = getSessionUser(token)
  if (!viewer) return { ok: false, error: 'Требуется авторизация.' }
  const target = getUserByName(targetUsername)
  if (!target) return { ok: false, error: 'Пользователь не найден.' }
  if (Number(target.id) === Number(viewer.id)) return { ok: false, error: 'Нельзя отправить сообщение себе.' }

  const relation = resolveFriendshipStatus(viewer.id, target.id)
  if (relation !== 'accepted') {
    return { ok: false, error: 'Отправка сообщений доступна только друзьям.' }
  }

  const message = normalizeLongText(text, 1200)
  if (!message) return { ok: false, error: 'Введите текст сообщения.' }

  const client = ensureDb()
  const thread = getOrCreateThread(client, viewer.id, target.id)
  const ts = now()

  const created = client
    .prepare('INSERT INTO chat_messages (thread_id, from_user_id, to_user_id, message, created_at, read_at) VALUES (?, ?, ?, ?, ?, NULL)')
    .run(thread.id, viewer.id, target.id, message, ts)

  client
    .prepare('UPDATE chat_threads SET updated_at = ?, last_message_at = ? WHERE id = ?')
    .run(ts, ts, thread.id)

  return {
    ok: true,
    message: {
      id: Number(created.lastInsertRowid),
      text: message,
      createdAt: ts,
      fromMe: true,
      fromUserId: viewer.id,
      toUserId: target.id,
    },
  }
}

module.exports = {
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
  ensureUser,
}
