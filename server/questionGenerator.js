const crypto = require('crypto')

const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim()
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
const OPENAI_REVIEW_MODEL = String(process.env.OPENAI_REVIEW_MODEL || OPENAI_MODEL).trim()

const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || '').trim()
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim()
const GEMINI_REVIEW_MODEL = String(process.env.GEMINI_REVIEW_MODEL || 'gemini-2.5-pro').trim()

const GROQ_API_KEY = String(process.env.GROQ_API_KEY || '').trim()
const GROQ_MODEL = String(process.env.GROQ_MODEL || 'openai/gpt-oss-20b').trim()
const GROQ_REVIEW_MODEL = String(process.env.GROQ_REVIEW_MODEL || GROQ_MODEL).trim()

const YC_API_KEY = String(process.env.YC_API_KEY || process.env.YANDEX_API_KEY || '').trim()
const YC_FOLDER_ID = String(process.env.YC_FOLDER_ID || process.env.YANDEX_FOLDER_ID || '').trim()
const YC_MODEL = String(process.env.YC_MODEL || 'yandexgpt-lite/latest').trim()
const YC_REVIEW_MODEL = String(process.env.YC_REVIEW_MODEL || YC_MODEL).trim()

const GIGACHAT_ACCESS_TOKEN = String(process.env.GIGACHAT_ACCESS_TOKEN || '').trim()
const GIGACHAT_AUTH_KEY = String(process.env.GIGACHAT_AUTH_KEY || '').trim()
const GIGACHAT_CLIENT_ID = String(process.env.GIGACHAT_CLIENT_ID || '').trim()
const GIGACHAT_CLIENT_SECRET = String(process.env.GIGACHAT_CLIENT_SECRET || '').trim()
const GIGACHAT_SCOPE = String(process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS').trim()
const GIGACHAT_MODEL = String(process.env.GIGACHAT_MODEL || 'GigaChat-2-Pro').trim()
const GIGACHAT_REVIEW_MODEL = String(process.env.GIGACHAT_REVIEW_MODEL || GIGACHAT_MODEL).trim()
const PEXELS_API_KEY = String(process.env.PEXELS_API_KEY || '').trim()

const validAiModes = new Set(['auto', 'free', 'openai', 'yandex', 'gigachat', 'hybrid', 'synthetic'])
const validTones = new Set(['balanced', 'fun', 'challenge'])
const validDifficultyModes = new Set(['mixed', 'easy', 'medium', 'hard'])
const CONTEXT_TIMEOUT_MS = clampNumber(process.env.CONTEXT_TIMEOUT_MS, 12000, 4000, 30000)
const FETCH_TIMEOUT_MS = clampNumber(process.env.CONTEXT_FETCH_TIMEOUT_MS, 4500, 2000, 12000)
const QUICK_CONTEXT_TIMEOUT_MS = clampNumber(process.env.QUICK_CONTEXT_TIMEOUT_MS, 3500, 2000, 15000)
const AI_REQUEST_TIMEOUT_MS = clampNumber(process.env.AI_REQUEST_TIMEOUT_MS, 6000, 3000, 20000)
const YANDEX_REQUEST_TIMEOUT_MS = clampNumber(
  process.env.YANDEX_REQUEST_TIMEOUT_MS,
  Math.max(12000, AI_REQUEST_TIMEOUT_MS),
  6000,
  30000,
)
const PROVIDER_COOLDOWN_MS = clampNumber(process.env.AI_PROVIDER_COOLDOWN_MS, 10 * 60 * 1000, 60 * 1000, 60 * 60 * 1000)
const CONTEXT_CACHE_TTL_MS = clampNumber(process.env.CONTEXT_CACHE_TTL_MS, 20 * 60 * 1000, 60 * 1000, 2 * 60 * 60 * 1000)
const CONTEXT_CACHE_MAX = clampNumber(process.env.CONTEXT_CACHE_MAX, 120, 20, 500)
const QUESTION_IMAGES_ENABLED = String(process.env.QUESTION_IMAGES_ENABLED || 'true').trim().toLowerCase() !== 'false'
const QUESTION_IMAGE_PARALLEL = clampNumber(process.env.QUESTION_IMAGE_PARALLEL, 3, 1, 6)
const QUESTION_IMAGE_TIMEOUT_MS = clampNumber(process.env.QUESTION_IMAGE_TIMEOUT_MS, 2800, 1000, 7000)
const QUESTION_IMAGE_TOTAL_BUDGET_MS = clampNumber(process.env.QUESTION_IMAGE_TOTAL_BUDGET_MS, 9000, 2500, 20000)
const QUESTION_IMAGE_CACHE_TTL_MS = clampNumber(process.env.QUESTION_IMAGE_CACHE_TTL_MS, 12 * 60 * 60 * 1000, 30 * 60 * 1000, 72 * 60 * 60 * 1000)
const QUESTION_IMAGE_CACHE_MAX = clampNumber(process.env.QUESTION_IMAGE_CACHE_MAX, 1200, 150, 4000)
const PEXELS_SEARCH_TIMEOUT_MS = clampNumber(process.env.PEXELS_SEARCH_TIMEOUT_MS, 2600, 1000, 7000)
const modeLabelMap = {
  capitals: 'Столицы',
  flags: 'Флаги',
  equations: 'Равенства',
  dice: 'Игральные кости',
  colors: 'Цвета',
  timer: 'Обратный отсчет',
  blitz: 'Блиц-раунд',
  expert: 'Экспертный раунд',
}
const validModes = new Set(Object.keys(modeLabelMap))

const stopwords = new Set([
  'это',
  'который',
  'которая',
  'которые',
  'также',
  'очень',
  'после',
  'перед',
  'когда',
  'если',
  'были',
  'было',
  'есть',
  'для',
  'или',
  'при',
  'над',
  'под',
  'про',
  'без',
  'как',
  'что',
  'его',
  'ее',
  'их',
  'the',
  'and',
  'with',
  'from',
  'into',
  'this',
  'that',
])

const themeNoiseWords = new Set(['история', 'основы', 'введение', 'теория', 'практика', 'методы', 'система', 'системы'])
const broadThemeWords = new Set([
  'страна',
  'страны',
  'мир',
  'история',
  'культура',
  'тема',
  'факт',
  'факты',
  'обзор',
  'основы',
])

const themeAliasMap = {
  сво: ['специальная военная операция', 'военная операция'],
}

const genericOptionPatterns = [
  /\b(?:ключевой|базовый|основной|главный)\s+(?:процесс|фактор|элемент|объект|теория|подход|контекст)\b/i,
  /\b(?:случайный|произвольный)\s+(?:ответ|вариант)\b/i,
  /\b(?:не знаю|затрудняюсь ответить|любой из вариантов)\b/i,
]

const boilerplateQuestionPatterns = [
  /^какой термин лучше всего соответствует факту/i,
  /^заполни пропуск по теме/i,
  /^что из перечисленного верно описывает факт/i,
  /^какое утверждение наиболее корректно для темы/i,
]

const genericSingleWordOptions = new Set([
  'флаг',
  'страна',
  'город',
  'объект',
  'термин',
  'понятие',
  'фактор',
  'элемент',
  'процесс',
  'событие',
  'контекст',
  'теория',
])

const genericHeadWords = new Set([
  'флаг',
  'флаги',
  'страна',
  'страны',
  'город',
  'города',
  'объект',
  'объекты',
  'термин',
  'термины',
  'понятие',
  'понятия',
  'фактор',
  'факторы',
  'элемент',
  'элементы',
  'процесс',
  'процессы',
])

const minimalThemeQuestionPatterns = [
  /^какое утверждение корректно для темы/i,
  /^что важно для качественной викторины по теме/i,
  /^какой подход верен при изучении темы/i,
  /^какой принцип применим к теме/i,
  /^что отражает корректную работу с темой/i,
  /^какой вариант наиболее точен для темы/i,
  /^как лучше формулировать вопросы по теме/i,
  /^какой критерий релевантен для темы/i,
]

const unrelatedTopicPool = [
  'Фотосинтез',
  'Генная инженерия',
  'Вулканология',
  'Тектоника плит',
  'Климатология',
  'История Рима',
  'Литература Серебряного века',
  'Античная философия',
  'Микроэкономика',
  'Бухгалтерский учет',
  'Логистика',
  'Астрономия',
  'Метеорология',
  'Архитектура Ренессанса',
  'Классическая музыка',
  'Теория вероятностей',
  'Геодезия',
  'Орнитология',
  'Биохимия',
  'Нейрофизиология',
]

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const randomFrom = (list) => list[Math.floor(Math.random() * list.length)]

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const providerCooldownUntil = {
  openai: 0,
  gemini: 0,
  groq: 0,
  yandex: 0,
  gigachat: 0,
}

const contextCache = new Map()
const questionImageCache = new Map()
const gigachatTokenCache = {
  value: '',
  expiresAt: 0,
  inFlight: null,
}

const isProviderCoolingDown = (provider) => {
  return Number(providerCooldownUntil[provider] || 0) > Date.now()
}

const setProviderCooldown = (provider) => {
  providerCooldownUntil[provider] = Date.now() + PROVIDER_COOLDOWN_MS
}

const readContextCache = (theme) => {
  const key = normalizeTheme(theme).toLowerCase()
  const entry = contextCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    contextCache.delete(key)
    return null
  }
  return entry.value
}

const writeContextCache = (theme, value) => {
  const key = normalizeTheme(theme).toLowerCase()
  if (contextCache.size >= CONTEXT_CACHE_MAX) {
    const oldestKey = contextCache.keys().next().value
    if (oldestKey) contextCache.delete(oldestKey)
  }
  contextCache.set(key, {
    value,
    expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS,
  })
}

const readQuestionImageCache = (key) => {
  const entry = questionImageCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    questionImageCache.delete(key)
    return null
  }
  return entry
}

const writeQuestionImageCache = (key, value) => {
  if (questionImageCache.size >= QUESTION_IMAGE_CACHE_MAX) {
    const oldestKey = questionImageCache.keys().next().value
    if (oldestKey) questionImageCache.delete(oldestKey)
  }
  questionImageCache.set(key, {
    value,
    expiresAt: Date.now() + QUESTION_IMAGE_CACHE_TTL_MS,
  })
}

const shuffle = (list) => {
  const cloned = [...list]
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cloned[i], cloned[j]] = [cloned[j], cloned[i]]
  }
  return cloned
}

const normalizeAiMode = (mode) => {
  const key = String(mode || '').trim().toLowerCase()
  return validAiModes.has(key) ? key : 'hybrid'
}

const normalizeTone = (tone) => {
  const key = String(tone || '').trim().toLowerCase()
  return validTones.has(key) ? key : 'balanced'
}

const normalizeDifficultyMode = (mode) => {
  const key = String(mode || '').trim().toLowerCase()
  return validDifficultyModes.has(key) ? key : 'mixed'
}

const normalizeModes = (modes) => {
  if (!Array.isArray(modes)) return []
  return modes
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item, index, list) => validModes.has(item) && list.indexOf(item) === index)
}

const normalizeTheme = (theme) => {
  const safe = String(theme || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return safe || 'Общая эрудиция'
}

const raceWithTimeout = async (promise, timeoutMs, fallbackValue) => {
  let timer = null
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallbackValue), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const safeJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const fetchJson = async (url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })

    if (!response.ok) return null
    return await safeJson(response)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const searchWikipedia = async ({ query, lang, limit }) => {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=${limit}&srprop=`
  const data = await fetchJson(url, {}, FETCH_TIMEOUT_MS)
  if (!data?.query?.search || !Array.isArray(data.query.search)) return []

  return data.query.search
    .map((item) => String(item?.title || '').trim())
    .filter(Boolean)
}

const fetchWikipediaExtract = async ({ title, lang }) => {
  if (/\(значения\)/i.test(title) || /\(disambiguation\)/i.test(title)) return null

  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`
  const data = await fetchJson(url, {}, FETCH_TIMEOUT_MS)
  const pages = data?.query?.pages || {}
  const firstPage = Object.values(pages)[0]
  const extract = String(firstPage?.extract || '').trim()
  if (!extract) return null
  if (/может означать/i.test(extract) && extract.length < 1600) return null

  return {
    title,
    lang,
    extract,
  }
}

const splitSentences = (text) => {
  if (!text) return []
  const normalized = text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const chunks = normalized.match(/[^.!?]+[.!?]?/g) || []
  return chunks
    .map((item) => item.trim())
    .filter(Boolean)
}

const isSentenceClean = (sentence) => {
  if (!sentence) return false
  if (/==|\{\{|\}\}|https?:\/\//i.test(sentence)) return false
  if (/\b(?:ISBN|ISSN|doi|URL|HTML|CSS|JavaScript)\b/i.test(sentence)) return false
  if (/\\displaystyle|{\s*\\|<[^>]+>/.test(sentence)) return false
  if (/[{}<>_=]{2,}/.test(sentence)) return false
  if (/\b(?:перевод|издательство|том\s+\d|выпуск\s+\d)\b/i.test(sentence)) return false
  if (/\s=\s/.test(sentence)) return false
  if (!/^[А-ЯA-ZЁ]/.test(sentence)) return false
  if (/^[-–—•]/.test(sentence)) return false
  if (/(?:\b[A-Za-z][A-Za-z-]{2,}\b[\s,;:]){3,}/.test(sentence)) return false

  const words = sentence.split(/\s+/).filter(Boolean)
  if (words.length < 8 || words.length > 38) return false
  if ((sentence.match(/\b\d{3,4}\b/g) || []).length > 2) return false

  const lettersCount = (sentence.match(/[\p{L}]/gu) || []).length
  if (lettersCount / Math.max(1, sentence.length) < 0.46) return false
  if (/[А-Яа-яЁё]/.test(sentence)) {
    const { latRatio, cyr } = scriptRatios(sentence)
    if (cyr > 15 && latRatio > 0.38) return false
  }

  return true
}

const buildFacts = (pages, theme) => {
  const facts = []
  const candidates = []
  const seen = new Set()
  const signals = buildThemeSignals(theme)
  const coreSignals = buildThemeCoreSignals(theme)
  const specificSignals = signals.filter((signal) => !broadThemeWords.has(signal))
  const strictCyrillicMode = isMostlyCyrillicTheme(theme)

  for (const page of pages) {
    const sentences = splitSentences(page.extract)
    for (const sentence of sentences) {
      const clean = sentence
        .replace(/\s+/g, ' ')
        .trim()
      if (clean.length < 45 || clean.length > 210) continue
      if (!isSentenceClean(clean)) continue
      if (/^см\.?\s/i.test(clean)) continue
      if (/^примечан/i.test(clean)) continue
      if (/^литератур/i.test(clean)) continue
      if ((clean.match(/[,;:]/g) || []).length > 3) continue
      const lowerClean = clean.toLowerCase()
      if (
        ['телесериал', 'сериал', 'фильм', 'роман', 'эпизод', 'сезон'].some((word) =>
          lowerClean.includes(word),
        )
      ) {
        continue
      }
      if (strictCyrillicMode) {
        const titleScript = scriptRatios(page.title)
        if (titleScript.latRatio > 0.72 && titleScript.cyr < 2) continue
        const { latRatio, cyr } = scriptRatios(clean)
        if (latRatio > 0.68 && cyr < 8) continue
      }

      const key = clean.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      const combinedText = `${page.title} ${clean}`
      if (specificSignals.length > 0 && !specificSignals.some((signal) => includesSignal(combinedText, signal))) {
        continue
      }

      const sentenceScore = relevanceScore(clean, signals)
      const titleScore = relevanceScore(page.title, signals)
      const punctuationPenalty = (clean.match(/[,;]/g) || []).length
      const simplicityBoost = Math.max(0, 4 - punctuationPenalty)
      const score = sentenceScore * 2 + titleScore + simplicityBoost
      if (signals.length > 0 && score === 0) continue
      if (signals.length >= 2 && sentenceScore === 0) continue
      const coreText = combinedText.toLowerCase()
      const coreMatches = coreSignals.filter((signal) => coreText.includes(signal)).length
      if (coreSignals.length > 0 && coreMatches === 0) continue
      if (coreSignals.length >= 4 && coreMatches < 2) continue

      candidates.push({
        title: page.title,
        sentence: clean,
        lang: page.lang,
        score,
      })
    }
  }

  const ranked = candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.title !== b.title) return a.title.localeCompare(b.title, 'ru')
    return a.sentence.length - b.sentence.length
  })

  for (const candidate of ranked) {
    facts.push({
      title: candidate.title,
      sentence: candidate.sentence,
      lang: candidate.lang,
    })

    if (facts.length >= 160) break
  }

  return facts
}

const buildSearchQueries = (theme) => {
  const normalized = normalizeTheme(theme)
  const normalizedLower = normalized.toLowerCase()
  const keywords = extractThemeKeywords(normalized)
  const core = buildThemeCoreSignals(normalized)
  const compact = keywords.slice(0, 5).join(' ')

  const queries = [normalized, `"${normalized}"`]
  const aliases = themeAliasMap[normalizedLower] || []
  aliases.forEach((alias) => queries.push(alias))
  if (compact && compact !== normalized.toLowerCase()) queries.push(compact)
  if (keywords.length >= 2) queries.push(`${keywords.slice(0, 2).join(' ')} определение`)
  if (keywords.length >= 2) queries.push(`${keywords.slice(0, 2).join(' ')} применение`)
  if (normalized.length <= 4) queries.push(`${normalized} что это`)
  if (core.length >= 2) queries.push(`${core.join(' ')} обзор`)

  return queries
    .map((query) => query.trim())
    .filter(Boolean)
    .filter((query, index, list) => list.indexOf(query) === index)
    .slice(0, 6)
}

const gatherContext = async ({ theme, queryLimit = 6, pageLimit = 14 }) => {
  const safeQueryLimit = clamp(Number(queryLimit) || 6, 2, 8)
  const safePageLimit = clamp(Number(pageLimit) || 14, 6, 20)
  const queries = buildSearchQueries(theme).slice(0, safeQueryLimit)
  const strictCyrillicMode = isMostlyCyrillicTheme(theme)

  const titleBucket = []
  const ruResults = await Promise.all(
    queries.map((query) => searchWikipedia({ query, lang: 'ru', limit: 8 })),
  )
  ruResults.forEach((titles) => {
    titles.forEach((title) => titleBucket.push({ title, lang: 'ru' }))
  })

  if (titleBucket.length < Math.max(6, Math.floor(safePageLimit / 2)) && (!strictCyrillicMode || titleBucket.length < 4)) {
    const enTitles = await searchWikipedia({ query: normalizeTheme(theme), lang: 'en', limit: 6 })
    enTitles.forEach((title) => titleBucket.push({ title, lang: 'en' }))
  }

  const unique = []
  const titleSet = new Set()
  for (const item of titleBucket) {
    const key = `${item.lang}:${item.title.toLowerCase()}`
    if (titleSet.has(key)) continue
    titleSet.add(key)
    unique.push(item)
    if (unique.length >= safePageLimit) break
  }

  const pagesRaw = await Promise.all(unique.map((item) => fetchWikipediaExtract(item)))
  const pages = pagesRaw.filter(Boolean)
  const facts = buildFacts(pages, theme)

  return {
    pages,
    facts,
  }
}

const parseModelArray = (raw) => {
  if (!raw || typeof raw !== 'string') return []
  const text = raw.trim()
  if (!text) return []

  const candidates = [
    text,
    text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim(),
  ]

  const left = text.indexOf('[')
  const right = text.lastIndexOf(']')
  if (left >= 0 && right > left) {
    candidates.push(text.slice(left, right + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.questions)) return parsed.questions
        if (Array.isArray(parsed.items)) return parsed.items
        if (Array.isArray(parsed.result)) return parsed.result
      }
    } catch {}
  }

  return []
}

const normalizeQuestion = (item, fallbackId, difficultyHint) => {
  if (!item || typeof item !== 'object') return null

  const question = String(item.question || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)

  const options = Array.isArray(item.options)
    ? item.options
        .map((option) =>
          String(option || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 180),
        )
        .filter(Boolean)
        .slice(0, 4)
    : []

  if (question.length < 16 || options.length !== 4) return null

  const uniqueOptions = new Set(options.map((option) => option.toLowerCase()))
  if (uniqueOptions.size !== 4) return null

  let correctIndex = Number(item.correctIndex)
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    correctIndex = 0
  }

  const difficultyRaw = String(item.difficulty || '').toLowerCase()
  const difficulty = ['easy', 'medium', 'hard'].includes(difficultyRaw) ? difficultyRaw : difficultyHint

  const explanation = String(item.explanation || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320)

  return {
    id: String(item.id || fallbackId).slice(0, 80),
    question,
    options,
    correctIndex,
    explanation: explanation || 'Правильный ответ подтверждается фактом из источников по теме.',
    difficulty,
  }
}

const uniquePush = (target, question, usedSet) => {
  const key = question.question.toLowerCase()
  if (usedSet.has(key)) return false
  usedSet.add(key)
  target.push(question)
  return true
}

const getDifficulty = (index, count, tone, difficultyMode = 'mixed') => {
  if (difficultyMode === 'easy' || difficultyMode === 'medium' || difficultyMode === 'hard') {
    return difficultyMode
  }

  const ratio = (index + 1) / Math.max(1, count)
  if (tone === 'challenge') {
    if (ratio <= 0.2) return 'easy'
    if (ratio <= 0.55) return 'medium'
    return 'hard'
  }
  if (tone === 'fun') {
    if (ratio <= 0.5) return 'easy'
    if (ratio <= 0.86) return 'medium'
    return 'hard'
  }
  if (ratio <= 0.34) return 'easy'
  if (ratio <= 0.74) return 'medium'
  return 'hard'
}

const extractThemeKeywords = (theme) => {
  const words = String(theme || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)

  const primary = words.filter((word) => word.length >= 4 && !stopwords.has(word))
  if (primary.length > 0) {
    if (primary.length === 1) return primary
    const narrowed = primary.filter((word) => !themeNoiseWords.has(word))
    return narrowed.length > 0 ? narrowed : primary
  }

  return words.filter((word) => word.length >= 2 && !stopwords.has(word)).slice(0, 4)
}

const getAliasKeywords = (theme) => {
  const normalizedLower = normalizeTheme(theme).toLowerCase()
  const aliases = themeAliasMap[normalizedLower] || []
  if (aliases.length === 0) return []

  const merged = aliases.flatMap((alias) => extractThemeKeywords(alias))
  return [...new Set(merged)]
}

const buildThemeSignals = (theme) => {
  const keywords = extractThemeKeywords(theme)
  const aliasKeywords = getAliasKeywords(theme)
  const sourceKeywords =
    aliasKeywords.length > 0
      ? [...aliasKeywords, ...keywords.filter((word) => word.length >= 4)]
      : keywords
  const signals = new Set()

  sourceKeywords.forEach((word) => {
    signals.add(word)
    if (word.length >= 7) signals.add(word.slice(0, 6))
    if (word.length >= 9) signals.add(word.slice(0, 7))
  })

  return [...signals]
}

const buildThemeCoreSignals = (theme) => {
  const keywords = extractThemeKeywords(theme)
  const aliasKeywords = getAliasKeywords(theme)
  const sourceKeywords =
    aliasKeywords.length > 0
      ? [...aliasKeywords, ...keywords.filter((word) => word.length >= 4)]
      : keywords

  return [...new Set(sourceKeywords)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 2)
}

const tokenize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stopwords.has(word))

const relevanceScore = (text, signals) => {
  if (!signals || signals.length === 0) return 1
  let score = 0
  signals.forEach((signal) => {
    if (includesSignal(text, signal)) score += signal.length >= 7 ? 2 : 1
  })
  return score
}

const includesSignal = (text, signal) => {
  const source = String(text || '').toLowerCase()
  const normalized = String(signal || '').toLowerCase().trim()
  if (!normalized) return false

  if (normalized.length <= 3) {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(source)
  }

  const variants = [normalized]
  if (normalized.length >= 5 && /[а-яё]$/i.test(normalized)) {
    variants.push(normalized.slice(0, -1))
  }
  if (normalized.length >= 6 && normalized.endsWith('ия')) {
    variants.push(normalized.slice(0, -2))
  }

  return variants.some((variant) => variant.length >= 3 && source.includes(variant))
}

const scriptRatios = (text) => {
  const source = String(text || '')
  const cyr = (source.match(/[А-Яа-яЁё]/g) || []).length
  const lat = (source.match(/[A-Za-z]/g) || []).length
  const total = cyr + lat
  if (total === 0) return { cyr: 0, lat: 0, cyrRatio: 0, latRatio: 0 }
  return { cyr, lat, cyrRatio: cyr / total, latRatio: lat / total }
}

const isMostlyCyrillicTheme = (theme) => {
  const { cyrRatio, latRatio } = scriptRatios(theme)
  return cyrRatio >= latRatio
}

const normalizeTextFragment = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim()

const toQuestionSentence = (text) => {
  const normalized = normalizeTextFragment(text)
    .replace(/[.]+$/g, '')
    .replace(/\?+$/g, '')
    .trim()
  return normalized ? `${normalized}?` : ''
}

const isSingleWordGenericOption = (option) => {
  const normalized = normalizeTextFragment(option).toLowerCase()
  if (!normalized) return false
  const parts = normalized.split(/\s+/).filter(Boolean)
  if (parts.length !== 1) return false
  return genericSingleWordOptions.has(parts[0])
}

const isGenericTitle = (value) => {
  const source = normalizeTextFragment(value)
  const normalized = source.toLowerCase()
  if (!normalized) return true
  const parts = normalized.split(/\s+/).filter(Boolean)
  if (parts.length === 1 && genericSingleWordOptions.has(parts[0])) return true

  const originalParts = source.split(/\s+/).filter(Boolean)
  if (parts.length > 1 && genericHeadWords.has(parts[0])) {
    const hasSpecificToken = originalParts.slice(1).some((token) => /^[A-ZА-ЯЁ]/.test(token))
    if (!hasSpecificToken) return true
  }

  return false
}

const scoreQuestionQuality = (question, themeSignals, strictCyrillicMode) => {
  let score = 100
  const text = String(question.question || '')
  const options = Array.isArray(question.options) ? question.options : []
  const explanation = String(question.explanation || '')

  if (text.length < 34) score -= 24
  if (text.length > 170) score -= 26
  if (!text.includes('?')) score -= 8

  if (boilerplateQuestionPatterns.some((pattern) => pattern.test(text))) score -= 20
  if (/\bпо теме\b/i.test(text) && /\bфакт\b/i.test(text)) score -= 12

  options.forEach((option) => {
    if (option.length < 2) score -= 25
    if (option.length > 82) score -= 22
    if (genericOptionPatterns.some((pattern) => pattern.test(option))) score -= 30
    if (isSingleWordGenericOption(option)) score -= 24

    if (strictCyrillicMode) {
      const { latRatio, cyr } = scriptRatios(option)
      if (latRatio > 0.75 && cyr < 2) score -= 18
    }
  })

  const optionLengths = options.map((option) => option.length)
  if (optionLengths.length === 4) {
    const min = Math.min(...optionLengths)
    const max = Math.max(...optionLengths)
    if (max - min > 65) score -= 10
  }

  if (themeSignals.length > 0) {
    const relevance = relevanceScore(`${text} ${options.join(' ')}`, themeSignals)
    score += Math.min(14, relevance * 2)
  }

  if (explanation.length < 24) score -= 12
  if (explanation.length > 320) score -= 8
  if (/\bотносится к объекту\b/i.test(explanation)) score -= 20

  return score
}

const isOptionSupportedByFacts = (option, factsText) => {
  const optionText = String(option || '').toLowerCase().trim()
  if (!optionText) return false

  const numberTokens = optionText.match(/\b\d{2,4}\b/g) || []
  if (numberTokens.some((token) => factsText.includes(token))) {
    return true
  }

  const tokens = tokenize(optionText).filter((token) => token.length >= 4)
  if (tokens.length === 0) return false

  return tokens.some((token) => factsText.includes(token))
}

const isThemeRelevant = (question, themeKeywords) => {
  if (themeKeywords.length === 0) return true
  const content = `${question.question} ${question.options.join(' ')}`.toLowerCase()
  return themeKeywords.some((word) => content.includes(word))
}

const hasGenericOptions = (options) => {
  return options.some((option) => {
    const text = String(option || '')
    if (genericOptionPatterns.some((pattern) => pattern.test(text))) return true
    if (isSingleWordGenericOption(text)) return true
    return false
  })
}

const normalizeImageSeed = (value) => {
  return normalizeTextFragment(value)
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

const titleStopwords = new Set([
  'какое',
  'какая',
  'какой',
  'какие',
  'кто',
  'что',
  'где',
  'когда',
  'почему',
  'как',
  'какую',
  'каком',
  'какая',
  'верный',
  'верно',
  'правильный',
  'какому',
  'какая',
  'каком',
])

const extractNamedEntities = (text) => {
  const matches = String(text || '').match(/\b[A-ZА-ЯЁ][\p{L}-]{2,}\b/gu) || []
  return matches
    .map((item) => normalizeImageSeed(item))
    .filter(Boolean)
    .filter((item) => !titleStopwords.has(item.toLowerCase()))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 8)
}

const buildImagePolicy = (question) => {
  const questionText = String(question?.question || '').toLowerCase()
  const allowSymbols = /\bфлаг|герб|эмблем|знам/i.test(questionText)
  const preferNature = !allowSymbols && /\bстран|государств|континент|материк|природ|город|столиц|ландшафт|океан/i.test(questionText)
  const preferWildlife = /\bживот|птиц|рыб|млекопита/i.test(questionText)
  return {
    allowSymbols,
    preferNature,
    preferWildlife,
  }
}

const buildImageSeedList = ({ question, theme, facts }) => {
  const seeds = []
  const safeTheme = normalizeTheme(theme)
  const correctOption = String(question?.options?.[question?.correctIndex] || '')
  const safeCorrectOption = normalizeImageSeed(correctOption)
  const questionEntities = extractNamedEntities(`${question?.question || ''} ${safeTheme}`)

  questionEntities.forEach((entity) => seeds.push(entity))
  if (safeCorrectOption && !isGenericTitle(safeCorrectOption)) {
    seeds.push(safeCorrectOption)
  }

  const questionText = String(question?.question || '')
  const questionTokens = tokenize(`${questionText} ${safeCorrectOption}`).filter((token) => token.length >= 4).slice(0, 8)

  let bestFact = null
  let bestScore = -1
  facts.forEach((fact) => {
    const title = String(fact?.title || '')
    const sentence = String(fact?.sentence || '')
    if (!title || isGenericTitle(title)) return
    let score = 0
    const factText = `${title} ${sentence}`.toLowerCase()
    questionTokens.forEach((token) => {
      if (factText.includes(token)) score += 1
    })
    if (safeCorrectOption && factText.includes(safeCorrectOption.toLowerCase())) score += 2
    if (score > bestScore) {
      bestScore = score
      bestFact = title
    }
  })

  if (bestFact && bestScore >= 2) seeds.push(normalizeImageSeed(bestFact))
  seeds.push(normalizeImageSeed(`${safeCorrectOption} ${safeTheme}`))
  seeds.push(normalizeImageSeed(`${safeTheme} ${safeCorrectOption}`))
  seeds.push(normalizeImageSeed(safeTheme))

  return seeds.filter(Boolean).filter((item, index, list) => list.indexOf(item) === index).slice(0, 5)
}

const buildVisualQueryList = ({ question, theme, seeds, facts }) => {
  const safeTheme = normalizeTheme(theme)
  const policy = buildImagePolicy(question)
  const queries = []
  const entities = extractNamedEntities(`${question?.question || ''} ${safeTheme}`)
  const safeCorrectOption = normalizeImageSeed(String(question?.options?.[question?.correctIndex] || ''))

  const pushQuery = (value) => {
    const clean = normalizeImageSeed(value).slice(0, 120)
    if (!clean) return
    if (queries.includes(clean)) return
    queries.push(clean)
  }

  seeds.forEach((seed) => pushQuery(seed))
  entities.forEach((entity) => pushQuery(entity))

  if (policy.preferNature) {
    entities.forEach((entity) => {
      pushQuery(`${entity} природа`)
      pushQuery(`${entity} пейзаж`)
      pushQuery(`${entity} туристический вид`)
      pushQuery(`${entity} landmarks`)
      pushQuery(`${entity} nature landscape`)
      pushQuery(`${entity} travel photography`)
    })
    pushQuery(`${safeTheme} природа`)
    pushQuery(`${safeTheme} пейзаж`)
    pushQuery(`${safeTheme} nature`)
    pushQuery(`${safeTheme} landscape`)
  }

  if (policy.preferWildlife) {
    entities.forEach((entity) => {
      pushQuery(`${entity} wildlife`)
      pushQuery(`${entity} животные`)
      pushQuery(`${entity} дикая природа`)
      if (safeCorrectOption) {
        pushQuery(`${entity} ${safeCorrectOption}`)
        pushQuery(`${safeCorrectOption} in ${entity}`)
      }
    })
    pushQuery(`${safeTheme} wildlife`)
    if (safeCorrectOption) {
      pushQuery(`${safeCorrectOption} animal photo`)
      pushQuery(`${safeCorrectOption} в природе`)
    }
  }

  if (policy.allowSymbols) {
    entities.forEach((entity) => {
      pushQuery(`${entity} флаг`)
      pushQuery(`${entity} flag`)
    })
    pushQuery(`${safeTheme} флаг`)
  }

  const relatedFactTitles = (facts || [])
    .slice(0, 24)
    .map((fact) => normalizeImageSeed(fact?.title || ''))
    .filter((title) => title && !isGenericTitle(title))
  relatedFactTitles.slice(0, 2).forEach((title) => pushQuery(title))

  pushQuery(safeTheme)
  return queries.slice(0, 10)
}

const toWikiTitle = (value) => {
  const safe = normalizeTextFragment(value)
    .replace(/[<>[\]{}|]/g, '')
    .trim()
    .slice(0, 120)
  if (!safe) return ''
  return safe.replace(/_/g, ' ')
}

const isSymbolicImage = (url, title) => {
  const source = `${String(url || '')} ${String(title || '')}`.toLowerCase()
  if (!source) return false
  if (/\bflag_of\b|[_-]flag[_-]|\bгерб\b|\bcoat[_-]?of[_-]?arms\b|\bemblem\b|\bseal\b/i.test(source)) return true
  if (/\.svg(\?|$)/i.test(source)) return true
  return false
}

const stripHtmlTags = (value) => {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const fetchWikipediaImageByTitle = async ({ title, lang, imagePolicy }) => {
  const safeTitle = toWikiTitle(title)
  if (!safeTitle || /\(значения\)|\(disambiguation\)/i.test(safeTitle)) return null

  const cacheKey = `wikiimg:title:${lang}:${safeTitle.toLowerCase()}:${imagePolicy?.allowSymbols ? 'sym' : 'nosym'}`
  const cached = readQuestionImageCache(cacheKey)
  if (cached) return cached.value

  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageimages|info&inprop=url&piprop=thumbnail|original&pithumbsize=1400&redirects=1&format=json&titles=${encodeURIComponent(
    safeTitle,
  )}`
  const data = await fetchJson(url, {}, QUESTION_IMAGE_TIMEOUT_MS)
  const pages = data?.query?.pages || {}
  const page = Object.values(pages).find((item) => item && !item.missing)
  if (!page) {
    writeQuestionImageCache(cacheKey, null)
    return null
  }

  const source = String(page?.original?.source || page?.thumbnail?.source || '').trim()
  if (!source) {
    writeQuestionImageCache(cacheKey, null)
    return null
  }

  const width = Number(page?.original?.width || page?.thumbnail?.width || 0)
  const height = Number(page?.original?.height || page?.thumbnail?.height || 0)
  const canonicalUrl = String(page?.canonicalurl || '').trim()
  const pageTitle = String(page?.title || safeTitle).trim()
  if (!imagePolicy?.allowSymbols && isSymbolicImage(source, pageTitle)) {
    writeQuestionImageCache(cacheKey, null)
    return null
  }

  const image = {
    url: source,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
    sourceUrl: canonicalUrl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/\s+/g, '_'))}`,
    sourceTitle: pageTitle,
    provider: 'wikipedia',
  }

  writeQuestionImageCache(cacheKey, image)
  return image
}

const searchWikipediaImage = async ({ query, lang, imagePolicy }) => {
  const safeQuery = normalizeImageSeed(query)
  if (!safeQuery) return null
  const cacheKey = `wikiimg:search:${lang}:${safeQuery.toLowerCase()}:${imagePolicy?.allowSymbols ? 'sym' : 'nosym'}`
  const cached = readQuestionImageCache(cacheKey)
  if (cached) return cached.value

  const titles = await searchWikipedia({ query: safeQuery, lang, limit: 5 })
  for (const title of titles.slice(0, 4)) {
    const image = await fetchWikipediaImageByTitle({ title, lang, imagePolicy })
    if (image) {
      writeQuestionImageCache(cacheKey, image)
      return image
    }
  }

  writeQuestionImageCache(cacheKey, null)
  return null
}

const fetchWikimediaCommonsImage = async ({ query, imagePolicy }) => {
  const safeQuery = normalizeImageSeed(query)
  if (!safeQuery) return null

  const cacheKey = `commonsimg:${safeQuery.toLowerCase()}:${imagePolicy?.allowSymbols ? 'sym' : 'nosym'}`
  const cached = readQuestionImageCache(cacheKey)
  if (cached) return cached.value

  const searchQuery = `filetype:bitmap ${safeQuery}`
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    searchQuery,
  )}&gsrnamespace=6&gsrlimit=12&prop=imageinfo|info&iiprop=url|size|mime|extmetadata&iiurlwidth=1800&inprop=url&format=json`

  const data = await fetchJson(url, {}, QUESTION_IMAGE_TIMEOUT_MS)
  const pages = Object.values(data?.query?.pages || {})
  if (pages.length === 0) {
    writeQuestionImageCache(cacheKey, null)
    return null
  }

  const scored = pages
    .map((page) => {
      const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null
      if (!info) return null

      const imageUrl = String(info?.thumburl || info?.url || '').trim()
      if (!imageUrl) return null

      const mime = String(info?.mime || '').toLowerCase()
      if (mime && !/image\/(jpeg|jpg|png|webp)/i.test(mime)) return null

      const pageTitle = String(page?.title || '').trim()
      if (!imagePolicy?.allowSymbols && isSymbolicImage(imageUrl, pageTitle)) return null

      const width = Number(info?.thumbwidth || info?.width || 0)
      const height = Number(info?.thumbheight || info?.height || 0)
      if (width < 700 || height < 420) return null

      const ratio = width > 0 && height > 0 ? width / height : 0
      const area = width * height
      let score = area / 1000000
      if (ratio >= 1.2 && ratio <= 2.4) score += 2
      if (ratio < 1) score -= 0.8

      const titleText = pageTitle.replace(/^File:/i, '')
      const imageDescription = stripHtmlTags(info?.extmetadata?.ImageDescription?.value || '')
      const merged = `${titleText} ${imageDescription}`.toLowerCase()

      if (imagePolicy?.preferNature && /\bnature|landscape|mountain|forest|ocean|beach|river|sunset|scenery|national park\b/i.test(merged)) score += 2.2
      if (imagePolicy?.preferWildlife && /\banimal|wildlife|bird|kangaroo|koala|emu|mammal|fauna\b/i.test(merged)) score += 2.2
      if (/\billustration|icon|logo|diagram|map\b/i.test(merged)) score -= 1.6

      return {
        score,
        image: {
          url: imageUrl,
          width,
          height,
          sourceUrl: String(page?.canonicalurl || info?.descriptionurl || 'https://commons.wikimedia.org').trim(),
          sourceTitle: normalizeTextFragment(titleText || safeQuery) || safeQuery,
          provider: 'commons',
        },
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)

  const winner = scored[0]?.image || null
  writeQuestionImageCache(cacheKey, winner)
  return winner
}

const fetchPexelsImage = async ({ query, imagePolicy }) => {
  if (!PEXELS_API_KEY) return null
  const safeQuery = normalizeImageSeed(query)
  if (!safeQuery) return null

  const cacheKey = `pexels:${safeQuery.toLowerCase()}:${imagePolicy?.allowSymbols ? 'sym' : 'nosym'}`
  const cached = readQuestionImageCache(cacheKey)
  if (cached) return cached.value

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(safeQuery)}&per_page=8&orientation=landscape&size=large&locale=ru-RU`
  const data = await fetchJson(
    url,
    {
      headers: {
        Authorization: PEXELS_API_KEY,
      },
    },
    PEXELS_SEARCH_TIMEOUT_MS,
  )

  const photos = Array.isArray(data?.photos) ? data.photos : []
  if (photos.length === 0) {
    writeQuestionImageCache(cacheKey, null)
    return null
  }

  const scored = photos
    .map((photo) => {
      const width = Number(photo?.width || 0)
      const height = Number(photo?.height || 0)
      const ratio = width > 0 && height > 0 ? width / height : 0
      const area = width * height
      let score = area / 1000000
      if (ratio >= 1.25 && ratio <= 2.2) score += 2
      if (ratio > 0 && ratio < 1.1) score -= 1.5
      const alt = String(photo?.alt || '').toLowerCase()
      if (imagePolicy?.preferNature && /\bnature|landscape|mountain|forest|ocean|beach|river|sunset\b/i.test(alt)) score += 2
      if (imagePolicy?.preferWildlife && /\banimal|wildlife|kangaroo|koala|bird|fish\b/i.test(alt)) score += 2
      return { photo, score }
    })
    .sort((a, b) => b.score - a.score)

  const best = scored[0]?.photo
  if (!best) {
    writeQuestionImageCache(cacheKey, null)
    return null
  }

  const imageUrl = String(best?.src?.large2x || best?.src?.landscape || best?.src?.large || best?.src?.original || '').trim()
  if (!imageUrl) {
    writeQuestionImageCache(cacheKey, null)
    return null
  }

  const image = {
    url: imageUrl,
    width: Number(best?.width || 0),
    height: Number(best?.height || 0),
    sourceUrl: String(best?.url || 'https://www.pexels.com').trim(),
    sourceTitle: normalizeTextFragment(best?.alt || safeQuery) || safeQuery,
    provider: 'pexels',
  }

  writeQuestionImageCache(cacheKey, image)
  return image
}

const resolveQuestionImage = async ({ question, theme, facts, deadlineTs }) => {
  if (!QUESTION_IMAGES_ENABLED) return null
  if (!question || !Array.isArray(question.options)) return null
  if (Date.now() >= deadlineTs) return null

  const cacheKey = `question:${normalizeTheme(theme).toLowerCase()}|${String(question.question || '')
    .toLowerCase()
    .trim()}`
  const cached = readQuestionImageCache(cacheKey)
  if (cached) return cached.value

  const seeds = buildImageSeedList({
    question,
    theme,
    facts,
  })
  if (seeds.length === 0) {
    writeQuestionImageCache(cacheKey, null)
    return null
  }
  const imagePolicy = buildImagePolicy(question)
  const visualQueries = buildVisualQueryList({
    question,
    theme,
    seeds,
    facts,
  })

  for (const query of visualQueries) {
    if (Date.now() >= deadlineTs) break
    const pexels = await fetchPexelsImage({
      query,
      imagePolicy,
    })
    if (pexels) {
      writeQuestionImageCache(cacheKey, pexels)
      return pexels
    }
  }

  for (const query of visualQueries) {
    if (Date.now() >= deadlineTs) break
    const commons = await fetchWikimediaCommonsImage({
      query,
      imagePolicy,
    })
    if (commons) {
      writeQuestionImageCache(cacheKey, commons)
      return commons
    }
  }

  for (const seed of seeds) {
    if (Date.now() >= deadlineTs) break
    const directRu = await fetchWikipediaImageByTitle({ title: seed, lang: 'ru', imagePolicy })
    if (directRu) {
      writeQuestionImageCache(cacheKey, directRu)
      return directRu
    }
    const directEn = await fetchWikipediaImageByTitle({ title: seed, lang: 'en', imagePolicy })
    if (directEn) {
      writeQuestionImageCache(cacheKey, directEn)
      return directEn
    }
  }

  for (const query of visualQueries) {
    if (Date.now() >= deadlineTs) break
    const searchRu = await searchWikipediaImage({ query, lang: 'ru', imagePolicy })
    if (searchRu) {
      writeQuestionImageCache(cacheKey, searchRu)
      return searchRu
    }
  }

  for (const query of visualQueries.slice(0, 3)) {
    if (Date.now() >= deadlineTs) break
    const searchEn = await searchWikipediaImage({ query, lang: 'en', imagePolicy })
    if (searchEn) {
      writeQuestionImageCache(cacheKey, searchEn)
      return searchEn
    }
  }

  writeQuestionImageCache(cacheKey, null)
  return null
}

const runWithConcurrency = async (tasks, parallelLimit) => {
  const queue = Array.isArray(tasks) ? tasks : []
  if (queue.length === 0) return
  const safeLimit = clamp(Number(parallelLimit) || 1, 1, 8)
  let index = 0

  const worker = async () => {
    while (index < queue.length) {
      const current = index
      index += 1
      try {
        await queue[current]()
      } catch {}
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeLimit, queue.length) }, () => worker()))
}

const enrichQuestionSetsWithImages = async ({ questionSets, theme, facts }) => {
  if (!QUESTION_IMAGES_ENABLED) return questionSets
  if (!questionSets || !Array.isArray(questionSets.A) || !Array.isArray(questionSets.B)) return questionSets

  const enriched = {
    A: questionSets.A.map((item) => ({ ...item })),
    B: questionSets.B.map((item) => ({ ...item })),
  }

  const deadlineTs = Date.now() + QUESTION_IMAGE_TOTAL_BUDGET_MS
  const tasks = []
  ;['A', 'B'].forEach((teamKey) => {
    const list = enriched[teamKey]
    list.forEach((question, index) => {
      tasks.push(async () => {
        if (!question || question.image || Date.now() >= deadlineTs) return
        const budgetLeft = deadlineTs - Date.now()
        if (budgetLeft <= 300) return
        const image = await raceWithTimeout(
          resolveQuestionImage({
            question,
            theme,
            facts,
            deadlineTs,
          }),
          Math.min(QUESTION_IMAGE_TIMEOUT_MS, budgetLeft),
          null,
        )
        if (image) {
          list[index] = {
            ...list[index],
            image,
          }
        }
      })
    })
  })

  await runWithConcurrency(tasks, QUESTION_IMAGE_PARALLEL)
  return enriched
}

const finalizeGeneration = async ({ provider, questionSets, theme, facts }) => {
  const enrichedSets = await enrichQuestionSetsWithImages({
    questionSets,
    theme,
    facts,
  })
  return {
    provider,
    questionSets: enrichedSets,
  }
}

const buildPrompt = ({ theme, count, tone, difficultyMode, modes, facts, contextLimit = 90 }) => {
  const modeLabels = modes.map((modeId) => modeLabelMap[modeId]).filter(Boolean)
  const contextLines = facts
    .slice(0, contextLimit)
    .map((fact, index) => `${index + 1}) [${fact.title}] ${fact.sentence}`)
    .join('\n')

  return [
    'Ты редактор соревновательной русскоязычной викторины.',
    `Тема: ${theme}.`,
    `Сложность матча: ${tone}.`,
    difficultyMode !== 'mixed'
      ? `Фиксированная сложность вопросов: ${difficultyMode}. Все вопросы должны иметь эту сложность.`
      : 'Сложность вопросов: смешанная (easy/medium/hard) с нарастанием.',
    modeLabels.length > 0 ? `Игровые режимы в интерфейсе: ${modeLabels.join(', ')}.` : '',
    `Сделай ${count} качественных вопросов с 4 вариантами ответа для широкой русскоязычной аудитории.`,
    'Обязательно: использовать только факты из контекста ниже. Никакой воды, общих рассуждений и невалидных вариантов.',
    'У каждого вопроса ровно один правильный ответ.',
    'Вопрос должен быть понятным и коротким: 35-160 символов.',
    'Варианты ответа должны быть 2-70 символов каждый, без служебных фраз и без "все ответы верны".',
    'Параметр difficulty выставляй по реальной сложности вопроса:',
    'easy — базовый общеизвестный факт; medium — нужен контекст; hard — редкий факт, сравнение или многошаговое знание.',
    'Неверные варианты должны быть правдоподобны и тематически близки к правильному.',
    'Избегай слишком общих однословных ответов вроде: "флаг", "страна", "объект", "термин".',
    'Нельзя использовать варианты-заглушки: "базовый элемент", "ключевой процесс", "научный подход", "исторический контекст".',
    'Не используй шаблон "Какой термин лучше всего соответствует факту..." и не копируй длинные предложения из источника целиком.',
    'Формат строго JSON-массив объектов:',
    '{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"...","difficulty":"easy|medium|hard"}',
    'Никакого markdown и никакого дополнительного текста.',
    'Контекст:',
    contextLines,
  ]
    .filter(Boolean)
    .join('\n')
}

const buildReviewPrompt = ({ theme, count, tone, difficultyMode, modes, facts, candidates }) => {
  const modeLabels = modes.map((modeId) => modeLabelMap[modeId]).filter(Boolean)
  const contextLines = facts
    .slice(0, 70)
    .map((fact, index) => `${index + 1}) [${fact.title}] ${fact.sentence}`)
    .join('\n')

  const candidateLines = candidates
    .slice(0, 28)
    .map((item, index) => `${index + 1}) ${JSON.stringify(item)}`)
    .join('\n')

  return [
    'Ты ведущий редактор турнирной викторины. Твоя задача: финальная полировка качества.',
    `Тема: ${theme}.`,
    `Нужно вернуть ровно ${count} вопросов.`,
    `Сложность матча: ${tone}.`,
    difficultyMode !== 'mixed'
      ? `Фиксированная сложность: ${difficultyMode} (все вопросы этой сложности).`
      : 'Смешанная сложность: easy/medium/hard с естественным градиентом.',
    modeLabels.length > 0 ? `Игровые режимы интерфейса: ${modeLabels.join(', ')}.` : '',
    'Из списка кандидатов выбери лучшие и при необходимости перепиши формулировки.',
    'Правила:',
    '- только проверяемые факты из контекста;',
    '- без двусмысленности, без длинных цитат;',
    '- ровно 4 варианта ответа, один правильный;',
    '- сохраняй реалистичную сложность в поле difficulty: easy/medium/hard по фактической сложности;',
    '- избегай общих однословных ответов вроде "флаг", "страна", "объект", "термин";',
    '- без англоязычного мусора в русскоязычном вопросе, если это не термин по теме;',
    '- без шаблонов и заглушек;',
    '- объяснение должно быть коротким и полезным.',
    'Верни строго JSON-массив объектов формата:',
    '{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"...","difficulty":"easy|medium|hard"}',
    'Кандидаты:',
    candidateLines,
    'Контекст фактов:',
    contextLines,
  ]
    .filter(Boolean)
    .join('\n')
}

const buildOpenKnowledgePrompt = ({ theme, count, tone, difficultyMode, modes }) => {
  const modeLabels = modes.map((modeId) => modeLabelMap[modeId]).filter(Boolean)

  return [
    'Ты редактор русскоязычной соревновательной викторины.',
    `Тема: ${theme}.`,
    `Сложность матча: ${tone}.`,
    difficultyMode !== 'mixed'
      ? `Фиксированная сложность вопросов: ${difficultyMode}.`
      : 'Сложность должна быть смешанной: easy/medium/hard.',
    modeLabels.length > 0 ? `Игровые режимы интерфейса: ${modeLabels.join(', ')}.` : '',
    `Создай ${count} качественных вопросов с 4 вариантами ответа.`,
    'Используй только общеизвестные и проверяемые факты по теме. Не используй узкоспециальные спорные детали.',
    'Вопрос должен быть коротким и понятным для широкой аудитории.',
    'Параметр difficulty выставляй по реальной сложности вопроса:',
    'easy — базовый общеизвестный факт; medium — нужен контекст; hard — редкий факт, сравнение или многошаговое знание.',
    'Варианты ответа: один правильный, три правдоподобных и тематически близких.',
    'Не используй слишком общие однословные ответы: "флаг", "страна", "объект", "термин".',
    'Без заглушек, без вариантов "все ответы верны/неверны".',
    'Формат строго JSON-массив объектов:',
    '{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"...","difficulty":"easy|medium|hard"}',
    'Никакого markdown и дополнительных комментариев.',
  ]
    .filter(Boolean)
    .join('\n')
}

const resolveGigachatAuthKey = () => {
  if (GIGACHAT_AUTH_KEY) return GIGACHAT_AUTH_KEY
  if (GIGACHAT_CLIENT_ID && GIGACHAT_CLIENT_SECRET) {
    return Buffer.from(`${GIGACHAT_CLIENT_ID}:${GIGACHAT_CLIENT_SECRET}`, 'utf8').toString('base64')
  }
  return ''
}

const gigachatAuthKey = resolveGigachatAuthKey()
const hasGigachatCredentials = () => Boolean(GIGACHAT_ACCESS_TOKEN || gigachatAuthKey)

const clearGigachatTokenCache = () => {
  gigachatTokenCache.value = ''
  gigachatTokenCache.expiresAt = 0
}

const getGigachatAccessToken = async () => {
  if (GIGACHAT_ACCESS_TOKEN) return GIGACHAT_ACCESS_TOKEN
  if (!gigachatAuthKey) return ''

  const nowTs = Date.now()
  if (gigachatTokenCache.value && nowTs + 60000 < gigachatTokenCache.expiresAt) {
    return gigachatTokenCache.value
  }

  if (gigachatTokenCache.inFlight) {
    return gigachatTokenCache.inFlight
  }

  gigachatTokenCache.inFlight = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${gigachatAuthKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          RqUID: crypto.randomUUID(),
        },
        body: `scope=${encodeURIComponent(GIGACHAT_SCOPE)}`,
        signal: controller.signal,
      })

      if (!response.ok) return ''
      const data = await safeJson(response)
      const token = String(data?.access_token || '').trim()
      if (!token) return ''

      const expiresRaw = Number(data?.expires_at || 0)
      let expiresAt = Date.now() + 25 * 60 * 1000
      if (Number.isFinite(expiresRaw) && expiresRaw > 0) {
        expiresAt = expiresRaw > 1e12 ? expiresRaw : expiresRaw * 1000
      }
      gigachatTokenCache.value = token
      gigachatTokenCache.expiresAt = expiresAt
      return token
    } catch {
      return ''
    } finally {
      clearTimeout(timer)
      gigachatTokenCache.inFlight = null
    }
  })()

  return gigachatTokenCache.inFlight
}

const requestGemini = async (prompt, mode = 'generation') => {
  if (!GEMINI_API_KEY) return null
  if (isProviderCoolingDown('gemini')) return null

  const model = mode === 'review' ? GEMINI_REVIEW_MODEL : GEMINI_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
  let data = null

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: mode === 'review' ? 0.15 : 0.28,
          topP: 0.85,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      if (response.status === 429 || response.status === 403 || response.status === 401) {
        setProviderCooldown('gemini')
      }
      return null
    }

    data = await safeJson(response)
  } catch {
    setProviderCooldown('gemini')
    return null
  } finally {
    clearTimeout(timer)
  }

  const content = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || ''
  if (!content) return null

  return parseModelArray(content)
}

const requestOpenAI = async (prompt, mode = 'generation') => {
  if (!OPENAI_API_KEY) return null
  if (isProviderCoolingDown('openai')) return null

  const model = mode === 'review' ? OPENAI_REVIEW_MODEL : OPENAI_MODEL

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
  let data = null

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: mode === 'review' ? 0.15 : 0.28,
        messages: [
          {
            role: 'system',
            content:
              mode === 'review'
                ? 'Ты строгий редактор. Возвращай только JSON-массив финальных вопросов без markdown.'
                : 'Генерируй только JSON-массив качественных вопросов без markdown.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      if (response.status === 429 || response.status === 403 || response.status === 401) {
        setProviderCooldown('openai')
      }
      return null
    }

    data = await safeJson(response)
  } catch {
    setProviderCooldown('openai')
    return null
  } finally {
    clearTimeout(timer)
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') return null

  return parseModelArray(content)
}

const requestGroq = async (prompt, mode = 'generation') => {
  if (!GROQ_API_KEY) return null
  if (isProviderCoolingDown('groq')) return null

  const model = mode === 'review' ? GROQ_REVIEW_MODEL : GROQ_MODEL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
  let data = null

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: mode === 'review' ? 0.15 : 0.28,
        messages: [
          {
            role: 'system',
            content:
              mode === 'review'
                ? 'Ты строгий редактор. Возвращай только JSON-массив финальных вопросов без markdown.'
                : 'Генерируй только JSON-массив качественных вопросов без markdown.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      if (response.status === 429 || response.status === 403 || response.status === 401) {
        setProviderCooldown('groq')
      }
      return null
    }

    data = await safeJson(response)
  } catch {
    setProviderCooldown('groq')
    return null
  } finally {
    clearTimeout(timer)
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') return null

  return parseModelArray(content)
}

const buildYandexModelUri = (model) => {
  const normalized = String(model || '').trim()
  if (!normalized) return ''
  if (/^gpt:\/\//i.test(normalized)) return normalized
  if (!YC_FOLDER_ID) return ''
  return `gpt://${YC_FOLDER_ID}/${normalized}`
}

const requestYandex = async (prompt, mode = 'generation') => {
  if (!YC_API_KEY || !YC_FOLDER_ID) return null
  if (isProviderCoolingDown('yandex')) return null

  const model = mode === 'review' ? YC_REVIEW_MODEL : YC_MODEL
  const modelUri = buildYandexModelUri(model)
  if (!modelUri) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), YANDEX_REQUEST_TIMEOUT_MS)
  let data = null

  try {
    const response = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${YC_API_KEY}`,
        'x-folder-id': YC_FOLDER_ID,
      },
      body: JSON.stringify({
        modelUri,
        completionOptions: {
          stream: false,
          temperature: mode === 'review' ? 0.15 : 0.28,
          maxTokens: '1800',
        },
        messages: [
          {
            role: 'system',
            text:
              mode === 'review'
                ? 'Ты строгий редактор. Возвращай только JSON-массив финальных вопросов без markdown.'
                : 'Генерируй только JSON-массив качественных вопросов без markdown.',
          },
          {
            role: 'user',
            text: prompt,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      if (response.status === 429 || response.status === 403 || response.status === 401) {
        setProviderCooldown('yandex')
      }
      return null
    }

    data = await safeJson(response)
  } catch (error) {
    if (!error || error.name !== 'AbortError') {
      setProviderCooldown('yandex')
    }
    return null
  } finally {
    clearTimeout(timer)
  }

  const content = data?.result?.alternatives?.[0]?.message?.text
  if (!content || typeof content !== 'string') return null
  return parseModelArray(content)
}

const requestGigachat = async (prompt, mode = 'generation') => {
  if (isProviderCoolingDown('gigachat')) return null

  let token = await getGigachatAccessToken()
  if (!token) return null

  const model = mode === 'review' ? GIGACHAT_REVIEW_MODEL : GIGACHAT_MODEL
  const execute = async (allowRetry) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
    let data = null

    try {
      const response = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: mode === 'review' ? 0.15 : 0.28,
          stream: false,
          messages: [
            {
              role: 'system',
              content:
                mode === 'review'
                  ? 'Ты строгий редактор. Возвращай только JSON-массив финальных вопросов без markdown.'
                  : 'Генерируй только JSON-массив качественных вопросов без markdown.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        if (response.status === 401 && allowRetry && !GIGACHAT_ACCESS_TOKEN) {
          clearGigachatTokenCache()
          token = await getGigachatAccessToken()
          if (!token) return null
          return execute(false)
        }
        if (response.status === 429 || response.status === 403 || response.status === 401) {
          setProviderCooldown('gigachat')
        }
        return null
      }

      data = await safeJson(response)
    } catch (error) {
      if (!error || error.name !== 'AbortError') {
        setProviderCooldown('gigachat')
      }
      return null
    } finally {
      clearTimeout(timer)
    }

    const content = data?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') return null
    return parseModelArray(content)
  }

  return execute(true)
}

const validateModelQuestions = ({
  items,
  count,
  teamLabel,
  facts,
  theme,
  tone,
  difficultyMode,
  usedQuestions,
  strictThemeRelevance = true,
}) => {
  const result = []
  const localSeen = new Set()
  const factsText = facts.map((fact) => fact.sentence.toLowerCase()).join(' ')
  const strictFactCheck = factsText.length > 40
  const keywords = buildThemeSignals(theme)
  const strictCyrillicMode = isMostlyCyrillicTheme(theme)

  items.forEach((item, index) => {
    const difficultyHint = getDifficulty(index, count, tone, difficultyMode)
    const normalized = normalizeQuestion(item, `ai-${teamLabel}-${index + 1}`, difficultyHint)
    if (!normalized) return
    if (difficultyMode !== 'mixed') {
      normalized.difficulty = difficultyHint
    }

    const correct = normalized.options[normalized.correctIndex]
    if (strictFactCheck) {
      const supportedByCorrect = isOptionSupportedByFacts(correct, factsText)
      const supportedByExplanation = isOptionSupportedByFacts(normalized.explanation, factsText)
      if (!supportedByCorrect && !supportedByExplanation) return
    }
    const themeRelevant = isThemeRelevant(normalized, keywords)
    if (!themeRelevant && strictThemeRelevance) return
    if (hasGenericOptions(normalized.options)) return

    const key = normalized.question.toLowerCase()
    if (localSeen.has(key)) return
    localSeen.add(key)

    const quality = scoreQuestionQuality(normalized, keywords, strictCyrillicMode)
    if (quality < 58) return
    if (!themeRelevant && quality < 70) return

    result.push({
      ...normalized,
      _quality: quality,
    })
  })

  const sorted = result.sort((a, b) => b._quality - a._quality)
  if (!usedQuestions) return sorted.slice(0, count * 4)

  const picked = []
  for (const item of sorted) {
    const candidate = { ...item }
    delete candidate._quality
    if (!uniquePush(picked, candidate, usedQuestions)) continue
    if (picked.length >= count) break
  }

  return picked
}

const extractCandidatesFromSentence = (sentence, title) => {
  const candidates = []
  const seen = new Set()

  const addCandidate = (type, value) => {
    const clean = String(value || '')
      .replace(/\s+/g, ' ')
      .trim()

    if (type === 'year') {
      if (!/^(1[5-9][0-9]{2}|20[0-9]{2})$/.test(clean)) return
    } else if (type === 'phrase') {
      const words = clean.split(/\s+/).filter(Boolean)
      if (words.length < 2 || words.length > 6) return
      if (words.every((word) => word.length < 5)) return
      if (/^(не|нет|это|она|оно|они|был|была|были|его|ее|её|их|этой|этого)\b/i.test(clean)) return
    } else {
      if (clean.length < 3 || clean.length > 72) return
      if (/^[IVXLCDM]+$/i.test(clean)) return
      if (!/[\p{L}]/u.test(clean)) return
      if (!/[\p{Ll}]/u.test(clean)) return
      if (isGenericTitle(clean)) return
      if (/^(не|это|однако|также|когда|если|который|которая|которые|поскольку)\b/i.test(clean)) return
      if (/[=;{}<>]/.test(clean)) return
      if (clean.split(/\s+/).length > 6) return
    }

    const key = `${type}:${clean.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ type, value: clean })
  }

  ;(sentence.match(/\b(1[5-9][0-9]{2}|20[0-9]{2})\b/g) || []).forEach((year) => addCandidate('year', year))

  const entityRegex = /\b[А-ЯA-ZЁ][А-Яа-яA-Za-zЁё-]{2,}(?:\s+[А-ЯA-ZЁ][А-Яа-яA-Za-zЁё-]{2,}){0,2}\b/g
  let entityMatch = entityRegex.exec(sentence)
  while (entityMatch) {
    const entity = entityMatch[0].trim()
    if (entity.toLowerCase() !== String(title || '').toLowerCase()) {
      addCandidate('entity', entity)
    }
    entityMatch = entityRegex.exec(sentence)
  }

  const quoteRegex = /«([^»]{2,80})»/g
  let quoteMatch = quoteRegex.exec(sentence)
  while (quoteMatch) {
    addCandidate('phrase', quoteMatch[1])
    quoteMatch = quoteRegex.exec(sentence)
  }

  return candidates
}

const collectPools = (facts, theme) => {
  const pools = {
    year: [],
    phrase: [],
    entity: [],
  }
  const strictCyrillicMode = isMostlyCyrillicTheme(theme)

  const append = (type, value) => {
    if (!pools[type]) return
    const clean = String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!clean) return
    if (type === 'entity' && isGenericTitle(clean)) return
    if (/^(не|да|нет|и|но|или|а|это|однако|его|ее|её|их|этой|этого)\b/i.test(clean)) return
    if (clean.toLowerCase() === 'не уверена') return
    if (strictCyrillicMode) {
      const { latRatio, cyr } = scriptRatios(clean)
      if (latRatio > 0.72 && cyr < 2) return
    }
    if (pools[type].some((item) => item.toLowerCase() === clean.toLowerCase())) return
    pools[type].push(clean)
  }

  facts.forEach((fact) => {
    append('entity', fact.title)
    const list = extractCandidatesFromSentence(fact.sentence, fact.title)
    list.forEach((candidate) => append(candidate.type, candidate.value))
  })

  return pools
}

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const replaceFirst = (text, find, replacement) => {
  const regex = new RegExp(escapeRegex(find))
  if (!regex.test(text)) return null
  return text.replace(regex, replacement)
}

const compactSentenceForQuestion = (sentence, maxLength = 128) => {
  const source = String(sentence || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!source) return ''

  const firstChunk = source.split(/[;:]/)[0].trim()
  const chunk = firstChunk || source
  if (chunk.length <= maxLength) return chunk

  const cutAt = chunk.lastIndexOf(' ', maxLength - 3)
  if (cutAt > 30) return `${chunk.slice(0, cutAt)}...`
  return `${chunk.slice(0, maxLength - 3)}...`
}

const selectDistinctValues = (pool, excludeValue, count) => {
  const lower = String(excludeValue || '').toLowerCase()
  return shuffle(pool).filter((item) => String(item).toLowerCase() !== lower).slice(0, count)
}

const buildDistractors = (candidate, pools) => {
  if (candidate.type === 'year') {
    const year = Number(candidate.value)
    const generated = [year - 1, year + 1, year - 3, year + 3, year - 7, year + 7]
      .filter((value) => value >= 1000 && value <= 2099)
      .map((value) => String(value))
    const nearbyPool = (pools.year || []).filter((item) => Math.abs(Number(item) - year) <= 35)
    const ordered = [...generated, ...nearbyPool, ...(pools.year || [])]
    const unique = []
    const seen = new Set()

    for (const item of ordered) {
      const text = String(item)
      if (text === candidate.value) continue
      if (seen.has(text)) continue
      seen.add(text)
      unique.push(text)
      if (unique.length >= 3) break
    }

    return unique
  }

  const sameTypePool = pools[candidate.type] || []
  const list = selectDistinctValues(sameTypePool, candidate.value, 3)

  if (list.length < 3 && candidate.type === 'phrase') {
    const extra = selectDistinctValues(pools.entity || [], candidate.value, 3 - list.length)
    list.push(...extra)
  }

  if (list.length < 3 && candidate.type === 'entity') {
    const extra = selectDistinctValues(pools.phrase || [], candidate.value, 3 - list.length)
    list.push(...extra)
  }

  if (list.length < 3 && candidate.type === 'phrase') {
    const extra = selectDistinctValues(pools.phrase || [], candidate.value, 3 - list.length)
    list.push(...extra)
  }

  if (list.length < 3) {
    const crossPool = [...(pools.entity || []), ...(pools.phrase || []), ...(pools.year || [])]
    const extra = selectDistinctValues(crossPool, candidate.value, 3 - list.length)
    list.push(...extra)
  }

  return list.slice(0, 3)
}

const buildOptions = (correct, wrong) => {
  const options = shuffle([correct, ...wrong])
    .map((item) => String(item).trim())
    .filter(Boolean)

  const unique = []
  const seen = new Set()
  for (const option of options) {
    const key = option.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(option)
    if (unique.length >= 4) break
  }

  if (unique.length < 4) return null

  return {
    options: unique,
    correctIndex: unique.findIndex((item) => item.toLowerCase() === String(correct).toLowerCase()),
  }
}

const buildLocalQuestionFromFact = ({ fact, pools, theme, difficulty, teamLabel, index, avoidYear }) => {
  const factSentence = normalizeTextFragment(fact.sentence)
  if (/^[А-ЯЁ][а-яё-]+,\s/.test(factSentence)) return null
  if (/^(однако|например|кроме того|при этом)\b/i.test(factSentence)) return null

  const candidates = extractCandidatesFromSentence(fact.sentence, fact.title)
  if (candidates.length === 0) return null
  const priority = {
    entity: 0,
    phrase: 1,
    year: 2,
  }
  const sortedCandidates = [...candidates].sort(
    (a, b) => Number(priority[a.type] ?? 9) - Number(priority[b.type] ?? 9),
  )

  for (const candidate of sortedCandidates) {
    if (avoidYear && candidate.type === 'year') continue
    if (/[…]/.test(candidate.value)) continue
    const wrong = buildDistractors(candidate, pools)
    if (wrong.length < 3) continue

    const optionBundle = buildOptions(candidate.value, wrong)
    if (!optionBundle || optionBundle.correctIndex < 0) continue

    const masked = replaceFirst(factSentence, candidate.value, '_____')
    if (!masked || masked === factSentence) continue

    const maskedText = compactSentenceForQuestion(masked, 96)
    if (/(?:\b(?:и|или|а|но)[.!?]?)$/i.test(maskedText)) continue
    const promptPrefix =
      candidate.type === 'year'
        ? 'В каком году произошло событие'
        : 'Какой вариант корректно дополняет утверждение'
    const question = toQuestionSentence(`${promptPrefix}: ${maskedText}`)
    if (!question) continue

    const explanation = isGenericTitle(fact.title)
      ? normalizeTextFragment(`В исходном факте корректный вариант: ${candidate.value}.`)
      : normalizeTextFragment(`В источнике «${fact.title}» корректный вариант: ${candidate.value}.`)
    if (explanation.length < 20) continue

    return {
      id: `loc-${teamLabel}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
      question,
      options: optionBundle.options,
      correctIndex: optionBundle.correctIndex,
      explanation,
      difficulty,
    }
  }

  return null
}

const buildFactChoiceQuestion = ({ theme, facts, pools, difficulty, teamLabel, index }) => {
  const filteredFacts = facts.filter((fact) => {
    const text = normalizeTextFragment(fact?.sentence || '')
    return (
      text.length >= 52 &&
      text.length <= 118 &&
      !isGenericTitle(fact?.title) &&
      !/^[А-ЯЁ][а-яё-]+,\s/.test(text) &&
      !/^(однако|например|кроме того|при этом)\b/i.test(text) &&
      !/какой термин лучше всего соответствует факту/i.test(text)
    )
  })

  if (filteredFacts.length === 0) return null
  const source = randomFrom(filteredFacts)
  if (!source) return null

  const correct = source.title
  if (isGenericTitle(correct)) return null
  const strictCyrillicMode = isMostlyCyrillicTheme(theme)
  const titlePool = [...new Set(facts.map((fact) => fact.title))].filter((item) => {
    if (!strictCyrillicMode) return true
    const { latRatio, cyr } = scriptRatios(item)
    return !(latRatio > 0.72 && cyr < 2)
  })
  const wrong = selectDistinctValues([...(pools.entity || []), ...titlePool], correct, 3).filter(
    (option) => !isGenericTitle(option),
  )

  if (wrong.length < 3) return null

  const optionBundle = buildOptions(correct, wrong)
  if (!optionBundle || optionBundle.correctIndex < 0) return null

  const factText = compactSentenceForQuestion(normalizeTextFragment(source.sentence), 96)
  if (factText.length < 28) return null
  if (/(?:\b(?:и|или|а|но)[.!?]?)$/i.test(factText)) return null

  const question = toQuestionSentence(`О каком объекте идет речь: ${factText}`)
  if (!question) return null

  const explanation = normalizeTextFragment(`В тексте описывается «${correct}», поэтому этот вариант правильный.`)
  if (explanation.length < 18) return null

  return {
    id: `fact-${teamLabel}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    question,
    options: optionBundle.options,
    correctIndex: optionBundle.correctIndex,
    explanation,
    difficulty,
  }
}

const buildStatementByTitleQuestion = ({ theme, facts, difficulty, teamLabel, index }) => {
  const validFacts = facts.filter((fact) => {
    const sentence = normalizeTextFragment(fact?.sentence || '')
    return sentence.length >= 45 && sentence.length <= 170 && !isGenericTitle(fact?.title)
  })
  if (validFacts.length < 4) return null

  const source = validFacts[index % validFacts.length]
  if (!source) return null

  const distractors = shuffle(
    validFacts.filter((item) => item.title.toLowerCase() !== source.title.toLowerCase()),
  ).slice(0, 3)
  if (distractors.length < 3) return null

  const optionLimit = clamp(78 - source.title.length, 32, 58)
  const toOption = (fact) => {
    const snippet = compactSentenceForQuestion(normalizeTextFragment(fact.sentence), optionLimit)
    if (!snippet || snippet.includes('...')) return ''
    return `${source.title}: ${snippet}`
  }

  const correct = toOption(source)
  if (!correct) return null
  const wrong = distractors.map(toOption).filter(Boolean)
  if (wrong.length < 3) return null

  const optionBundle = buildOptions(correct, wrong)
  if (!optionBundle || optionBundle.correctIndex < 0) return null

  const question = toQuestionSentence(`Какое утверждение по теме «${theme}» корректно описывает «${source.title}»`)
  if (!question) return null

  return {
    id: `stmt-${teamLabel}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    question,
    options: optionBundle.options,
    correctIndex: optionBundle.correctIndex,
    explanation: normalizeTextFragment(`Верный вариант основан на факте из материала «${source.title}».`),
    difficulty,
  }
}

const buildAttributionQuestion = ({ theme, facts, difficulty, teamLabel, index }) => {
  const valid = facts.filter((fact) => {
    const text = String(fact?.sentence || '')
    return text.length >= 52 && text.length <= 160 && !isGenericTitle(fact?.title)
  })
  if (valid.length < 4) return null

  const source = randomFrom(valid)
  if (!source) return null

  const distractors = shuffle(
    valid.filter((item) => item.title.toLowerCase() !== source.title.toLowerCase()),
  ).slice(0, 3)
  if (distractors.length < 3) return null

  const correctOption = compactSentenceForQuestion(source.sentence, 92)
  const wrongOptions = distractors.map((item) => compactSentenceForQuestion(item.sentence, 92)).filter(Boolean)
  if (wrongOptions.length < 3) return null
  if ([correctOption, ...wrongOptions].some((item) => item.includes('...'))) return null

  const optionBundle = buildOptions(correctOption, wrongOptions)
  if (!optionBundle || optionBundle.correctIndex < 0) return null

  const question = toQuestionSentence(`Какой факт верно относится к «${source.title}»`)
  if (!question) return null

  const explanation = normalizeTextFragment(`Верный вариант описывает факт о «${source.title}».`)

  return {
    id: `attr-${teamLabel}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    question,
    options: optionBundle.options,
    correctIndex: optionBundle.correctIndex,
    explanation,
    difficulty,
  }
}

const extractSentenceLexemes = (text) => {
  return String(text || '')
    .match(/[\p{L}\p{N}-]{4,}/gu)
    ?.map((word) => String(word || '').trim())
    .filter(Boolean) || []
}

const buildKeywordGapQuestion = ({ theme, facts, difficulty, teamLabel, index }) => {
  const sourceFacts = facts.filter((fact) => {
    const sentence = normalizeTextFragment(fact?.sentence || '')
    return sentence.length >= 45 && sentence.length <= 170 && !isGenericTitle(fact?.title)
  })
  if (sourceFacts.length === 0) return null

  const lexemePool = [
    ...new Set(
      facts.flatMap((fact) => extractSentenceLexemes(fact?.sentence || '')).filter((word) => {
        const lower = word.toLowerCase()
        if (stopwords.has(lower)) return false
        if (lower.length < 5) return false
        if (/^\d+$/.test(lower)) return false
        if (isSingleWordGenericOption(word)) return false
        return true
      }),
    ),
  ]

  for (const source of shuffle(sourceFacts)) {
    const sentence = normalizeTextFragment(source.sentence)
    const lexemes = extractSentenceLexemes(sentence).filter((word) => {
      const lower = word.toLowerCase()
      if (stopwords.has(lower)) return false
      if (lower.length < 5) return false
      if (/^\d+$/.test(lower)) return false
      if (isSingleWordGenericOption(word)) return false
      return true
    })
    if (lexemes.length === 0) continue

    const correctWord = lexemes.sort((a, b) => b.length - a.length)[0]
    if (!correctWord) continue

    const wrongOptions = selectDistinctValues(lexemePool, correctWord, 3).filter((item) => !isSingleWordGenericOption(item))
    if (wrongOptions.length < 3) continue

    const maskRegex = new RegExp(`\\b${escapeRegex(correctWord)}\\b`, 'iu')
    if (!maskRegex.test(sentence)) continue
    const masked = sentence.replace(maskRegex, '_____')
    if (masked === sentence) continue

    const optionBundle = buildOptions(correctWord, wrongOptions)
    if (!optionBundle || optionBundle.correctIndex < 0) continue

    const maskedText = compactSentenceForQuestion(masked, 106)
    if (!maskedText || maskedText.includes('...')) continue
    if (/(?:\b(?:и|или|а|но)[.!?]?)$/i.test(maskedText)) continue

    const question = toQuestionSentence(`Заполните пропуск по теме «${theme}»: ${maskedText}`)
    if (!question) continue

    return {
      id: `gap-${teamLabel}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
      question,
      options: optionBundle.options,
      correctIndex: optionBundle.correctIndex,
      explanation: normalizeTextFragment(`Верный вариант встречается в источнике «${source.title}».`),
      difficulty,
    }
  }

  return null
}

const buildMinimalThemeQuestion = ({ theme, difficulty, teamLabel, index }) => {
  const questionTemplates = [
    `Какое утверждение корректно для темы «${theme}»`,
    `Что важно для качественной викторины по теме «${theme}»`,
    `Какой подход верен при изучении темы «${theme}»`,
    `Какой принцип применим к теме «${theme}»`,
    `Что отражает корректную работу с темой «${theme}»`,
    `Какой вариант наиболее точен для темы «${theme}»`,
    `Как лучше формулировать вопросы по теме «${theme}»`,
    `Какой критерий релевантен для темы «${theme}»`,
  ]
  const correctTemplates = [
    `Тема «${theme}» опирается на проверяемые факты и корректные источники`,
    `По теме «${theme}» важны точные определения и контекст`,
    `Материалы по теме «${theme}» должны быть достоверными и понятными`,
    `Для темы «${theme}» корректны ответы, которые подтверждаются фактами`,
  ]
  const wrongPool = [
    `Тема «${theme}» строится только на случайных догадках`,
    `Для темы «${theme}» проверка фактов не нужна`,
    `По теме «${theme}» всегда верен любой ответ`,
    `Тема «${theme}» не требует точных формулировок`,
    `По теме «${theme}» нельзя проверить правильность ответа`,
    `Тема «${theme}» не связана с реальными данными`,
  ]

  const correct = correctTemplates[index % correctTemplates.length]
  const wrong = shuffle(wrongPool.filter((item) => item.toLowerCase() !== correct.toLowerCase())).slice(0, 3)
  const optionBundle = buildOptions(correct, wrong)
  if (!optionBundle || optionBundle.correctIndex < 0) return null

  return {
    id: `theme-${teamLabel}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    question: toQuestionSentence(questionTemplates[index % questionTemplates.length]),
    options: optionBundle.options,
    correctIndex: optionBundle.correctIndex,
    explanation: normalizeTextFragment(`Корректный вариант соответствует содержанию темы «${theme}».`),
    difficulty,
  }
}

const isMinimalThemeQuestion = (questionText) => {
  const text = String(questionText || '').trim()
  if (!text) return false
  return minimalThemeQuestionPatterns.some((pattern) => pattern.test(text))
}

const shouldBoostWithTitleHints = (questions) => {
  if (!Array.isArray(questions) || questions.length === 0) return true
  const minimalCount = questions.filter((item) => isMinimalThemeQuestion(item?.question)).length
  return minimalCount >= Math.ceil(questions.length / 2)
}

const buildTitleHintQuestion = ({ theme, correct, distractors, difficulty, teamLabel, index }) => {
  const templates = [
    `Какой термин напрямую связан с темой «${theme}»`,
    `Какое понятие относится к теме «${theme}»`,
    `Какой объект корректно выбран для темы «${theme}»`,
    `Какой вариант релевантен теме «${theme}»`,
    `Что действительно входит в круг темы «${theme}»`,
    `Какой термин встречается в материалах по теме «${theme}»`,
  ]
  const optionBundle = buildOptions(correct, distractors)
  if (!optionBundle || optionBundle.correctIndex < 0) return null

  return {
    id: `hint-${teamLabel}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    question: toQuestionSentence(templates[index % templates.length]),
    options: optionBundle.options,
    correctIndex: optionBundle.correctIndex,
    explanation: normalizeTextFragment(`Термин «${correct}» найден среди связанных материалов по теме.`),
    difficulty,
  }
}

const generateTitleHintQuestions = ({
  theme,
  count,
  tone,
  difficultyMode,
  teamLabel,
  usedQuestions,
  titles,
  baseQuestions,
}) => {
  if (!Array.isArray(titles) || titles.length < 4) return baseQuestions.slice(0, count)

  const cleanedTitles = [...new Set(titles.map((item) => normalizeTextFragment(item)).filter(Boolean))]
  const validTitles = cleanedTitles.filter((item) => !isGenericTitle(item))
  if (validTitles.length < 4) return baseQuestions.slice(0, count)

  const result = []
  const base = Array.isArray(baseQuestions) ? baseQuestions : []
  base.forEach((item) => {
    if (!item) return
    if (!isLocalQuestionAcceptable(item, theme)) return
    const key = String(item.question || '').toLowerCase()
    if (!key) return
    if (result.some((existing) => String(existing.question || '').toLowerCase() === key)) return
    if (usedQuestions) usedQuestions.add(key)
    result.push(item)
  })

  const offset = teamLabel === 'B' ? 1 : 0
  let cursor = 0
  while (result.length < count && cursor < validTitles.length * 3) {
    const correct = validTitles[(cursor + offset) % validTitles.length]
    const distractors = selectDistinctValues(unrelatedTopicPool, correct, 3)
    if (distractors.length < 3) {
      cursor += 1
      continue
    }

    const difficulty = getDifficulty(result.length, count, tone, difficultyMode)
    const question = buildTitleHintQuestion({
      theme,
      correct,
      distractors,
      difficulty,
      teamLabel,
      index: cursor,
    })
    if (question && isLocalQuestionAcceptable(question, theme) && uniquePush(result, question, usedQuestions)) {
      cursor += 1
      continue
    }

    cursor += 1
  }

  return result.slice(0, count)
}

const rotateFacts = (facts, offset) => {
  if (facts.length === 0) return []
  const safeOffset = ((offset % facts.length) + facts.length) % facts.length
  return [...facts.slice(safeOffset), ...facts.slice(0, safeOffset)]
}

const isLocalQuestionAcceptable = (question, theme) => {
  if (!question) return false
  if (!Array.isArray(question.options) || question.options.length !== 4) return false
  if (hasGenericOptions(question.options)) return false
  if (question.options.some((option) => String(option || '').includes('...'))) return false
  if (/\bпо теме\b/i.test(question.question) && /\bфакт\b/i.test(question.question)) return false
  if (/\bотносится к объекту\b/i.test(question.explanation || '')) return false

  const signals = buildThemeSignals(theme)
  const strictCyrillicMode = isMostlyCyrillicTheme(theme)
  if (strictCyrillicMode) {
    const hasLatinNoise = question.options.some((option) => {
      const { latRatio, cyr } = scriptRatios(option)
      return latRatio > 0.6 && cyr < 2
    })
    if (hasLatinNoise) return false
  }
  const quality = scoreQuestionQuality(question, signals, strictCyrillicMode)
  if (quality < 50) return false
  if (!isThemeRelevant(question, signals)) return false
  return true
}

const generateLocalQuestions = ({ theme, count, tone, difficultyMode, teamLabel, facts, usedQuestions, variantOffset = 0 }) => {
  const result = []
  const pools = collectPools(facts, theme)
  const offset = teamLabel === 'B' ? Math.floor(facts.length / 3) : 0
  const sequence = rotateFacts(facts, offset)

  let cursor = 0
  while (result.length < count && cursor < sequence.length * 8) {
    const fact = sequence[cursor % sequence.length]
    const index = result.length
    const difficulty = getDifficulty(index, count, tone, difficultyMode)
    const yearQuestionsCount = result.filter((item) => /^В каком году/i.test(item.question)).length
    const maxYearQuestions = Math.max(1, Math.floor(count / 3))
    const avoidYear = yearQuestionsCount >= maxYearQuestions

    const candidate = buildLocalQuestionFromFact({
      fact,
      pools,
      theme,
      difficulty,
      teamLabel,
      index: cursor,
      avoidYear,
    })

    if (candidate && isLocalQuestionAcceptable(candidate, theme) && uniquePush(result, candidate, usedQuestions)) {
      cursor += 1
      continue
    }

    cursor += 1
  }

  let fallbackCursor = 0
  while (result.length < count && fallbackCursor < sequence.length * 8) {
    const fact = sequence[fallbackCursor % sequence.length]
    const difficulty = getDifficulty(result.length, count, tone, difficultyMode)

    const statementByTitle = buildStatementByTitleQuestion({
      theme,
      facts: sequence,
      difficulty,
      teamLabel,
      index: fallbackCursor,
    })
    if (
      statementByTitle &&
      isLocalQuestionAcceptable(statementByTitle, theme) &&
      uniquePush(result, statementByTitle, usedQuestions)
    ) {
      fallbackCursor += 1
      continue
    }

    const factChoice = buildFactChoiceQuestion({
      theme,
      facts: sequence,
      pools,
      difficulty,
      teamLabel,
      index: fallbackCursor,
    })
    if (factChoice && isLocalQuestionAcceptable(factChoice, theme) && uniquePush(result, factChoice, usedQuestions)) {
      fallbackCursor += 1
      continue
    }

    const attribution = buildAttributionQuestion({
      theme,
      facts: sequence,
      difficulty,
      teamLabel,
      index: fallbackCursor,
    })
    if (attribution && isLocalQuestionAcceptable(attribution, theme) && uniquePush(result, attribution, usedQuestions)) {
      fallbackCursor += 1
      continue
    }

    const gapQuestion = buildKeywordGapQuestion({
      theme,
      facts: sequence,
      difficulty,
      teamLabel,
      index: fallbackCursor,
    })
    if (gapQuestion && isLocalQuestionAcceptable(gapQuestion, theme) && uniquePush(result, gapQuestion, usedQuestions)) {
      fallbackCursor += 1
      continue
    }

    fallbackCursor += 1
  }

  let minimalAttempt = 0
  while (result.length < count && minimalAttempt < count * 8) {
    const difficulty = getDifficulty(result.length, count, tone, difficultyMode)
    const minimal = buildMinimalThemeQuestion({
      theme,
      difficulty,
      teamLabel,
      index: variantOffset + result.length + minimalAttempt,
    })
    minimalAttempt += 1
    if (!minimal) continue
    uniquePush(result, minimal, usedQuestions)
  }

  return result.slice(0, count)
}

const providerOrder = (mode) => {
  if (mode === 'openai') return ['openai', 'yandex', 'gigachat', 'groq', 'gemini']
  if (mode === 'yandex') return ['yandex', 'gigachat', 'groq', 'gemini']
  if (mode === 'gigachat') return ['gigachat', 'yandex', 'gemini', 'groq']
  if (mode === 'hybrid') return ['yandex', 'gigachat', 'gemini', 'groq', 'openai']
  if (mode === 'auto') return ['openai', 'yandex', 'gigachat', 'groq', 'gemini']
  if (mode === 'free') return ['yandex', 'gigachat', 'groq', 'gemini']
  return []
}

const providerAvailable = (provider) => {
  if (provider === 'gemini') return Boolean(GEMINI_API_KEY) && !isProviderCoolingDown('gemini')
  if (provider === 'openai') return Boolean(OPENAI_API_KEY) && !isProviderCoolingDown('openai')
  if (provider === 'groq') return Boolean(GROQ_API_KEY) && !isProviderCoolingDown('groq')
  if (provider === 'yandex') return Boolean(YC_API_KEY) && Boolean(YC_FOLDER_ID) && !isProviderCoolingDown('yandex')
  if (provider === 'gigachat') return hasGigachatCredentials() && !isProviderCoolingDown('gigachat')
  return false
}

const requestByProvider = async (provider, prompt, mode = 'generation') => {
  if (provider === 'gemini') return requestGemini(prompt, mode)
  if (provider === 'openai') return requestOpenAI(prompt, mode)
  if (provider === 'groq') return requestGroq(prompt, mode)
  if (provider === 'yandex') return requestYandex(prompt, mode)
  if (provider === 'gigachat') return requestGigachat(prompt, mode)
  return null
}

const pickReviewerProvider = (generationProvider) => {
  if (generationProvider === 'openai') {
    if (providerAvailable('yandex')) return 'yandex'
    if (providerAvailable('gigachat')) return 'gigachat'
    if (providerAvailable('groq')) return 'groq'
    if (providerAvailable('gemini')) return 'gemini'
    return 'openai'
  }
  if (generationProvider === 'groq') {
    if (providerAvailable('yandex')) return 'yandex'
    if (providerAvailable('gigachat')) return 'gigachat'
    if (providerAvailable('openai')) return 'openai'
    if (providerAvailable('gemini')) return 'gemini'
    return 'groq'
  }
  if (generationProvider === 'gemini') {
    if (providerAvailable('yandex')) return 'yandex'
    if (providerAvailable('gigachat')) return 'gigachat'
    if (providerAvailable('groq')) return 'groq'
    if (providerAvailable('openai')) return 'openai'
    return 'gemini'
  }
  if (generationProvider === 'yandex') {
    if (providerAvailable('gigachat')) return 'gigachat'
    if (providerAvailable('gemini')) return 'gemini'
    if (providerAvailable('groq')) return 'groq'
    if (providerAvailable('openai')) return 'openai'
    return 'yandex'
  }
  if (generationProvider === 'gigachat') {
    if (providerAvailable('yandex')) return 'yandex'
    if (providerAvailable('gemini')) return 'gemini'
    if (providerAvailable('groq')) return 'groq'
    if (providerAvailable('openai')) return 'openai'
    return 'gigachat'
  }
  return generationProvider
}

const pushUniqueByQuestion = (target, items) => {
  const seen = new Set(target.map((item) => item.question.toLowerCase()))
  items.forEach((item) => {
    const key = String(item.question || '').toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    target.push(item)
  })
}

const pickTopQuestions = ({ items, count, usedQuestions }) => {
  const sorted = [...items].sort((a, b) => Number(b?._quality || 0) - Number(a?._quality || 0))
  const picked = []

  for (const item of sorted) {
    const candidate = { ...item }
    delete candidate._quality
    if (!uniquePush(picked, candidate, usedQuestions)) continue
    if (picked.length >= count) break
  }

  return picked
}

const questionKey = (question) => String(question?.question || '').toLowerCase().trim()

const harmonizeTeamSets = ({ teamA, teamB, theme, count, tone, difficultyMode }) => {
  const safeA = Array.isArray(teamA) ? teamA.slice(0, count) : []
  const sourceB = Array.isArray(teamB) ? teamB : []

  const blocked = new Set(safeA.map((item) => questionKey(item)).filter(Boolean))
  const used = new Set(blocked)
  const normalizedB = []

  sourceB.forEach((item) => {
    const key = questionKey(item)
    if (!key || used.has(key)) return
    used.add(key)
    normalizedB.push(item)
  })

  let fillerAttempt = 0
  while (normalizedB.length < count && fillerAttempt < count * 12) {
    const difficulty = getDifficulty(normalizedB.length, count, tone, difficultyMode)
    const fallback = buildMinimalThemeQuestion({
      theme,
      difficulty,
      teamLabel: 'B',
      index: count + fillerAttempt + 7,
    })
    fillerAttempt += 1
    if (!fallback) continue
    const key = questionKey(fallback)
    if (!key || used.has(key)) continue
    used.add(key)
    normalizedB.push(fallback)
  }

  while (normalizedB.length < count && safeA.length > 0) {
    const source = safeA[normalizedB.length % safeA.length]
    if (!source) break
    const difficulty = getDifficulty(normalizedB.length, count, tone, difficultyMode)
    let candidate = {
      ...source,
      id: `${source.id}-b-${normalizedB.length + 1}`,
      question: `${source.question} (вариант B${normalizedB.length + 1})`,
      difficulty,
    }
    let key = questionKey(candidate)
    let copyAttempt = 1
    while (used.has(key) && copyAttempt <= 5) {
      candidate = {
        ...candidate,
        question: `${source.question} (вариант B${normalizedB.length + 1}.${copyAttempt})`,
      }
      key = questionKey(candidate)
      copyAttempt += 1
    }
    if (used.has(key)) break
    used.add(key)
    normalizedB.push(candidate)
  }

  return {
    A: safeA,
    B: normalizedB.slice(0, count),
  }
}

const generateTeamByProvider = async ({
  provider,
  theme,
  count,
  tone,
  difficultyMode,
  modes,
  facts,
  usedQuestions,
  teamLabel,
  aiMode,
  preferSpeed = false,
  allowPartial = false,
}) => {
  if (!providerAvailable(provider)) return null

  const freeBudgetMode = aiMode === 'free'
  const draftTarget = preferSpeed
    ? clamp(count + 1, count, count + 2)
    : freeBudgetMode
      ? clamp(count * 2, count + 1, 10)
      : clamp(count * 3, count + 3, 16)
  const attemptLimit = preferSpeed ? 1 : freeBudgetMode ? 2 : 3
  const contextLimit = freeBudgetMode ? 48 : 90
  const draftPool = []

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    if (!providerAvailable(provider)) break
    const prompt = buildPrompt({
      theme,
      count: draftTarget,
      tone,
      difficultyMode,
      modes,
      facts,
      contextLimit,
    })

    const rawItems = await requestByProvider(provider, prompt, 'generation')
    if (!rawItems || rawItems.length === 0) {
      if (!providerAvailable(provider)) break
      continue
    }

    const validated = validateModelQuestions({
      items: rawItems,
      count: draftTarget,
      teamLabel,
      facts,
      theme,
      tone,
      difficultyMode,
    })

    if (validated.length > 0) {
      pushUniqueByQuestion(draftPool, validated)
    }

    if (draftPool.length >= draftTarget) break
  }

  if (draftPool.length === 0) return null

  let polishedPool = draftPool
  const reviewer = pickReviewerProvider(provider)
  if (!freeBudgetMode && !preferSpeed && providerAvailable(reviewer)) {
    const reviewPrompt = buildReviewPrompt({
      theme,
      count: Math.max(count + 2, Math.ceil(draftTarget * 0.6)),
      tone,
      difficultyMode,
      modes,
      facts,
      candidates: draftPool,
    })
    const reviewedRaw = await requestByProvider(reviewer, reviewPrompt, 'review')
    if (reviewedRaw && reviewedRaw.length > 0) {
      const reviewedValidated = validateModelQuestions({
        items: reviewedRaw,
        count: draftTarget,
        teamLabel,
        facts,
        theme,
        tone,
        difficultyMode,
      })

      if (reviewedValidated.length > 0) {
        polishedPool = []
        pushUniqueByQuestion(polishedPool, reviewedValidated)
        pushUniqueByQuestion(polishedPool, draftPool)
      }
    }
  }

  const picked = pickTopQuestions({
    items: polishedPool,
    count,
    usedQuestions,
  })

  if (picked.length >= count) return picked
  return allowPartial && picked.length > 0 ? picked : null
}

const generateTeamByProviderOpenKnowledge = async ({
  provider,
  theme,
  count,
  tone,
  difficultyMode,
  modes,
  usedQuestions,
  teamLabel,
  aiMode,
  preferSpeed = false,
  allowPartial = false,
}) => {
  if (!providerAvailable(provider)) return null

  const freeBudgetMode = aiMode === 'free'
  const target = preferSpeed
    ? clamp(count + 1, count, count + 2)
    : freeBudgetMode
      ? clamp(count * 2, count + 1, 10)
      : clamp(count * 2, count + 2, 14)
  const attempts = preferSpeed ? 1 : freeBudgetMode ? 2 : 3
  const pool = []

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!providerAvailable(provider)) break
    const prompt = buildOpenKnowledgePrompt({
      theme,
      count: target,
      tone,
      difficultyMode,
      modes,
    })
    const raw = await requestByProvider(provider, prompt, 'generation')
    if (!raw || raw.length === 0) {
      if (!providerAvailable(provider)) break
      continue
    }

    const validated = validateModelQuestions({
      items: raw,
      count: target,
      teamLabel,
      facts: [],
      theme,
      tone,
      difficultyMode,
      strictThemeRelevance: false,
    })
    if (validated.length > 0) pushUniqueByQuestion(pool, validated)
    if (pool.length >= target) break
  }

  if (pool.length === 0) return null
  const picked = pickTopQuestions({ items: pool, count, usedQuestions })
  if (picked.length >= count) return picked
  return allowPartial && picked.length > 0 ? picked : null
}

const buildHybridTeamSets = async ({
  theme,
  count,
  tone,
  difficultyMode,
  modes,
  facts,
  aiMode,
  preferSpeed,
}) => {
  const providers = providerOrder('hybrid').filter((provider) => providerAvailable(provider))
  if (providers.length === 0) return null

  const poolA = []
  const poolB = []

  const collectFromFactsByProvider = async (provider) => {
    try {
      const providerUsedA = new Set()
      const providerUsedB = new Set()

      const teamA = await generateTeamByProvider({
        provider,
        theme,
        count,
        tone,
        difficultyMode,
        modes,
        facts,
        usedQuestions: providerUsedA,
        teamLabel: 'A',
        aiMode,
        preferSpeed,
        allowPartial: true,
      })

      teamA?.forEach((item) => {
        const key = questionKey(item)
        if (key) providerUsedB.add(key)
      })

      const teamB = await generateTeamByProvider({
        provider,
        theme,
        count,
        tone,
        difficultyMode,
        modes,
        facts,
        usedQuestions: providerUsedB,
        teamLabel: 'B',
        aiMode,
        preferSpeed,
        allowPartial: true,
      })

      return {
        teamA: teamA || [],
        teamB: teamB || [],
      }
    } catch {
      return { teamA: [], teamB: [] }
    }
  }

  const collectOpenKnowledgeByProvider = async (provider) => {
    try {
      const providerUsedA = new Set()
      const providerUsedB = new Set()

      const teamA = await generateTeamByProviderOpenKnowledge({
        provider,
        theme,
        count,
        tone,
        difficultyMode,
        modes,
        usedQuestions: providerUsedA,
        teamLabel: 'A',
        aiMode,
        preferSpeed,
        allowPartial: true,
      })

      teamA?.forEach((item) => {
        const key = questionKey(item)
        if (key) providerUsedB.add(key)
      })

      const teamB = await generateTeamByProviderOpenKnowledge({
        provider,
        theme,
        count,
        tone,
        difficultyMode,
        modes,
        usedQuestions: providerUsedB,
        teamLabel: 'B',
        aiMode,
        preferSpeed,
        allowPartial: true,
      })

      return {
        teamA: teamA || [],
        teamB: teamB || [],
      }
    } catch {
      return { teamA: [], teamB: [] }
    }
  }

  if (!preferSpeed && Array.isArray(facts) && facts.length >= 8) {
    const factResults = await Promise.all(providers.map((provider) => collectFromFactsByProvider(provider)))
    factResults.forEach((result) => {
      pushUniqueByQuestion(poolA, result.teamA || [])
      pushUniqueByQuestion(poolB, result.teamB || [])
    })
  }

  if (poolA.length < count || poolB.length < count) {
    const openResults = await Promise.all(providers.map((provider) => collectOpenKnowledgeByProvider(provider)))
    openResults.forEach((result) => {
      pushUniqueByQuestion(poolA, result.teamA || [])
      pushUniqueByQuestion(poolB, result.teamB || [])
    })
  }

  if (poolA.length === 0 || poolB.length === 0) return null

  const usedA = new Set()
  const teamA = pickTopQuestions({ items: poolA, count, usedQuestions: usedA })
  if (teamA.length === 0) return null

  const usedB = new Set(teamA.map((item) => questionKey(item)).filter(Boolean))
  const teamB = pickTopQuestions({ items: poolB, count, usedQuestions: usedB })
  if (teamB.length === 0) return null

  const teamSets = harmonizeTeamSets({
    teamA,
    teamB,
    theme,
    count,
    tone,
    difficultyMode,
  })

  if (teamSets.A.length < count || teamSets.B.length < count) return null
  return teamSets
}

const generateQuizQuestions = async ({ theme, count, aiMode, tone, difficultyMode, modes, preferSpeed = false }) => {
  const safeTheme = normalizeTheme(theme)
  const safeCount = clamp(Number(count) || 5, 1, 7)
  const safeAiMode = normalizeAiMode(aiMode)
  const safeTone = normalizeTone(tone)
  const safeDifficultyMode = normalizeDifficultyMode(difficultyMode)
  const safeModes = normalizeModes(modes)

  const providersReady =
    providerAvailable('openai') ||
    providerAvailable('groq') ||
    providerAvailable('gemini') ||
    providerAvailable('yandex') ||
    providerAvailable('gigachat')
  const fastContextMode = Boolean(preferSpeed) || (safeAiMode !== 'synthetic' && providersReady)
  let context = readContextCache(safeTheme)

  if (context && !fastContextMode && (!Array.isArray(context.facts) || context.facts.length < 12)) {
    context = null
  }

  if (!context) {
    const gatheredContext = await raceWithTimeout(
      gatherContext({
        theme: safeTheme,
        queryLimit: fastContextMode ? 4 : 6,
        pageLimit: fastContextMode ? 8 : 14,
      }).catch(() => null),
      fastContextMode ? QUICK_CONTEXT_TIMEOUT_MS : CONTEXT_TIMEOUT_MS,
      null,
    )

    if (gatheredContext && Array.isArray(gatheredContext.facts)) {
      context = gatheredContext
      writeContextCache(safeTheme, gatheredContext)
    }
  }

  if (!context || !Array.isArray(context.facts)) {
    context = { pages: [], facts: [] }
  }

  const facts = context.facts
  const blendLabelMode = safeAiMode === 'auto' && providerAvailable('openai') && providerAvailable('gemini')

  if (safeAiMode === 'hybrid') {
    const hybridSets = await buildHybridTeamSets({
      theme: safeTheme,
      count: safeCount,
      tone: safeTone,
      difficultyMode: safeDifficultyMode,
      modes: safeModes,
      facts,
      aiMode: safeAiMode,
      preferSpeed,
    })

    if (hybridSets) {
      return finalizeGeneration({
        provider: 'hybrid',
        questionSets: hybridSets,
        theme: safeTheme,
        facts,
      })
    }
  }

  if (facts.length >= 8) {
    const order = providerOrder(safeAiMode)
    for (const provider of order) {
      const providerUsedA = new Set()
      const providerUsedB = new Set()
      const teamA = await generateTeamByProvider({
        provider,
        theme: safeTheme,
        count: safeCount,
        tone: safeTone,
        difficultyMode: safeDifficultyMode,
        modes: safeModes,
        facts,
        usedQuestions: providerUsedA,
        teamLabel: 'A',
        aiMode: safeAiMode,
        preferSpeed,
        allowPartial: false,
      })

      teamA?.forEach((item) => {
        const key = String(item?.question || '').toLowerCase().trim()
        if (key) providerUsedB.add(key)
      })

      const teamB = await generateTeamByProvider({
        provider,
        theme: safeTheme,
        count: safeCount,
        tone: safeTone,
        difficultyMode: safeDifficultyMode,
        modes: safeModes,
        facts,
        usedQuestions: providerUsedB,
        teamLabel: 'B',
        aiMode: safeAiMode,
        preferSpeed,
        allowPartial: false,
      })

      if (!teamA || teamA.length < safeCount || !teamB || teamB.length < safeCount) continue
      const teamSets = harmonizeTeamSets({
        teamA,
        teamB,
        theme: safeTheme,
        count: safeCount,
        tone: safeTone,
        difficultyMode: safeDifficultyMode,
      })
      if (teamSets.A.length < safeCount || teamSets.B.length < safeCount) continue

      return finalizeGeneration({
        provider: blendLabelMode ? 'hybrid' : provider,
        questionSets: teamSets,
        theme: safeTheme,
        facts,
      })
    }
  }

  if (safeAiMode !== 'synthetic') {
    const order = providerOrder(safeAiMode)
    for (const provider of order) {
      const providerUsedA = new Set()
      const providerUsedB = new Set()
      const teamA = await generateTeamByProviderOpenKnowledge({
        provider,
        theme: safeTheme,
        count: safeCount,
        tone: safeTone,
        difficultyMode: safeDifficultyMode,
        modes: safeModes,
        usedQuestions: providerUsedA,
        teamLabel: 'A',
        aiMode: safeAiMode,
        preferSpeed,
        allowPartial: false,
      })

      teamA?.forEach((item) => {
        const key = String(item?.question || '').toLowerCase().trim()
        if (key) providerUsedB.add(key)
      })

      const teamB = await generateTeamByProviderOpenKnowledge({
        provider,
        theme: safeTheme,
        count: safeCount,
        tone: safeTone,
        difficultyMode: safeDifficultyMode,
        modes: safeModes,
        usedQuestions: providerUsedB,
        teamLabel: 'B',
        aiMode: safeAiMode,
        preferSpeed,
        allowPartial: false,
      })
      if (!teamA || teamA.length < safeCount || !teamB || teamB.length < safeCount) continue
      const teamSets = harmonizeTeamSets({
        teamA,
        teamB,
        theme: safeTheme,
        count: safeCount,
        tone: safeTone,
        difficultyMode: safeDifficultyMode,
      })
      if (teamSets.A.length < safeCount || teamSets.B.length < safeCount) continue

      return finalizeGeneration({
        provider: safeAiMode === 'hybrid' ? 'hybrid' : provider,
        questionSets: teamSets,
        theme: safeTheme,
        facts,
      })
    }
  }

  const pageFacts = (context.pages || [])
    .slice(0, 18)
    .map((page) => ({
      title: page.title,
      sentence: `${page.title} напрямую связан(а) с темой «${safeTheme}».`,
      lang: page.lang || 'ru',
    }))
  const enrichedFacts = [...facts]
  pageFacts.forEach((item) => {
    const key = `${item.title.toLowerCase()}::${item.sentence.toLowerCase()}`
    const exists = enrichedFacts.some(
      (fact) => `${String(fact.title || '').toLowerCase()}::${String(fact.sentence || '').toLowerCase()}` === key,
    )
    if (!exists) enrichedFacts.push(item)
  })

  const fallbackFacts =
    enrichedFacts.length > 0
      ? enrichedFacts
      : [{ title: safeTheme, sentence: `${safeTheme} — отдельная тема знаний и обсуждения.` }]
  const usedQuestionsA = new Set()
  const usedQuestionsB = new Set()

  let teamA = generateLocalQuestions({
    theme: safeTheme,
    count: safeCount,
    tone: safeTone,
    difficultyMode: safeDifficultyMode,
    teamLabel: 'A',
    facts: fallbackFacts,
    usedQuestions: usedQuestionsA,
    variantOffset: 0,
  })

  teamA.forEach((item) => {
    const key = String(item?.question || '').toLowerCase().trim()
    if (key) usedQuestionsB.add(key)
  })

  let teamB = generateLocalQuestions({
    theme: safeTheme,
    count: safeCount,
    tone: safeTone,
    difficultyMode: safeDifficultyMode,
    teamLabel: 'B',
    facts: fallbackFacts,
    usedQuestions: usedQuestionsB,
    variantOffset: safeCount + 3,
  })

  if (shouldBoostWithTitleHints(teamA) || shouldBoostWithTitleHints(teamB)) {
    let titleHints = [...new Set((context.pages || []).map((page) => normalizeTextFragment(page?.title || '')).filter(Boolean))]
    if (titleHints.length < 4) {
      const searchedTitles = await raceWithTimeout(
        searchWikipedia({ query: safeTheme, lang: 'ru', limit: 10 }),
        2200,
        [],
      )
      titleHints = [...new Set([...titleHints, ...searchedTitles.map((title) => normalizeTextFragment(title)).filter(Boolean)])]
    }

    if (titleHints.length >= 4) {
      if (shouldBoostWithTitleHints(teamA)) {
        teamA = generateTitleHintQuestions({
          theme: safeTheme,
          count: safeCount,
          tone: safeTone,
          difficultyMode: safeDifficultyMode,
          teamLabel: 'A',
          usedQuestions: usedQuestionsA,
          titles: titleHints,
          baseQuestions: teamA.filter((item) => !isMinimalThemeQuestion(item?.question)),
        })
      }

      if (shouldBoostWithTitleHints(teamB)) {
        teamB = generateTitleHintQuestions({
          theme: safeTheme,
          count: safeCount,
          tone: safeTone,
          difficultyMode: safeDifficultyMode,
          teamLabel: 'B',
          usedQuestions: usedQuestionsB,
          titles: titleHints,
          baseQuestions: teamB.filter((item) => !isMinimalThemeQuestion(item?.question)),
        })
      }
    }
  }

  const teamSets = harmonizeTeamSets({
    teamA,
    teamB,
    theme: safeTheme,
    count: safeCount,
    tone: safeTone,
    difficultyMode: safeDifficultyMode,
  })

  return finalizeGeneration({
    provider: 'synthetic',
    questionSets: teamSets,
    theme: safeTheme,
    facts: fallbackFacts,
  })
}

module.exports = {
  generateQuizQuestions,
}
