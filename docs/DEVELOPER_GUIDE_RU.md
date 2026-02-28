# Руководство Разработчика QuizBattle

## Структура проекта

- `/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/client` — клиент (React + TypeScript + Vite).
- `/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/server` — backend, Socket.IO, AI-генерация.
- `/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/docs` — документация.

## UI-разделы

- `Играть` — создание матча и вход по PIN.
- `Комнаты` — каталог активных лобби и быстрый вход.
- `Аккаунт` — авторизация и профиль.
- `Друзья` — social-функции, приглашения, чат.
- `Лидерборд` — рейтинг.
- `История` — архив и аналитика матчей.

## Системный поток

1. Ведущий создает комнату через `host:createRoom`.
2. Игроки входят через `player:joinRoom`.
3. Ведущий запускает матч через `host:startGame`.
4. Сервер подготавливает полный пакет вопросов через `generateQuizQuestions`.
5. Раунды идут в realtime, ответы отправляются через `round:submitAnswer`.
6. По завершению матча сервер сохраняет статистику и экспорт.

## AI-пайплайн

- Пользователь не выбирает AI вручную: режим задается сервером (`SERVER_AI_MODE`).
- Значение по умолчанию: `hybrid`.
- Поддерживаемые режимы: `hybrid`, `free`, `auto`, `openai`, `yandex`, `gigachat`, `synthetic`.
- `hybrid`:
  - параллельно опрашивает доступные провайдеры (`YandexGPT`, `GigaChat`, `Gemini`, `Groq`, `OpenAI`);
  - агрегирует кандидатов;
  - валидирует и дедуплицирует вопросы;
  - собирает итоговые наборы для команд.
- При недоступности внешнего AI включается локальный fallback (`synthetic`) без падения игры.
- Для фиксированной сложности (`easy/medium/hard`) итоговые вопросы удерживаются в выбранном уровне.

## Контракты сокетов

- `host:createRoom` — создание комнаты.
- `player:joinRoom` — вход игрока.
- `host:rejoinRoom` — переподключение ведущего по `hostKey`.
- `host:startGame` — старт матча.
- `host:togglePause` — пауза/продолжение.
- `host:skipRound` — пропуск текущего вопроса.
- `host:nextRound` — переход к следующему вопросу.
- `host:kickPlayer` — дисквалификация участника.
- `host:exportResults` — ручной экспорт завершенного матча.
- `round:submitAnswer` — ответ активной стороны.
- `player:leaveRoom` — выход из комнаты.
- `room:state` — синхронизация состояния.
- `room:closed` — закрытие комнаты.

## HTTP API

- `GET /health` — состояние сервера.
- `GET /meta` — AI-режим, доступные провайдеры, каталоги режимов.
- `GET /api/rooms` — каталог комнат с фильтрами:
  - `status` (`lobby|running|paused|finished|all`, по умолчанию `lobby`),
  - `q` (тема/PIN/ведущий),
  - `format` (`teams|ffa`),
  - `limit`.
- `POST /api/auth/register` — регистрация.
- `POST /api/auth/login` — вход.
- `GET /api/leaderboard?limit=20` — рейтинг.
- `GET /api/history?limit=15` — история матчей.
- `GET /api/profile/:username?limit=15` — профиль и персональные матчи.

## Локальная разработка

```bash
cd /Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio
npm install
npm run dev
```

## Проверки перед релизом

```bash
npm run lint
npm run build
node --check server/index.js
node --check server/questionGenerator.js
```

## Ключевые переменные окружения

- `PORT` — порт backend.
- `CLIENT_URL` — публичный URL клиента для `inviteLink`.
- `SERVER_AI_MODE` — серверный режим AI (`hybrid` по умолчанию).
- `START_GENERATION_TIMEOUT_MS` — таймаут старта генерации.
- `FALLBACK_GENERATION_TIMEOUT_MS` — таймаут резервного пути генерации.
- `QUESTION_IMAGES_ENABLED` — включение автоподбора изображений к вопросам.
- `QUESTION_IMAGE_TOTAL_BUDGET_MS` — общий бюджет времени на подбор изображений.

- `YC_API_KEY`, `YC_FOLDER_ID`, `YC_MODEL` — YandexGPT.
- `GIGACHAT_ACCESS_TOKEN` или `GIGACHAT_AUTH_KEY` (+ `GIGACHAT_SCOPE`) — GigaChat.
- `GEMINI_API_KEY`, `GEMINI_MODEL` — Gemini.
- `GROQ_API_KEY`, `GROQ_MODEL` — Groq.
- `OPENAI_API_KEY`, `OPENAI_MODEL` — OpenAI.

SQLite инициализируется автоматически в `server/data/quizbattle.db`.

## Экспорт и хранение

- Экспорт JSON выполняется автоматически при завершении матча.
- Повторный ручной экспорт доступен через `host:exportResults`.
- Каталог экспорта: `${process.cwd()}/exports` (обычно `server/exports`).

## Устойчивость соединения

- Для ведущего: пауза матча и окно возврата `90s`.
- Для игроков: окно возврата `60s` по `playerKey`.
- Если ведущий не вернулся в срок, комната закрывается через `room:closed`.

## Форматы матчей

- `teams` — базовый формат ТЗ с чередованием `A -> B`.
- `ffa` — каждый игрок играет за себя, итог по персональным очкам.

## Игровые режимы и ограничения

- `team_battle` — стандартный командный режим.
- `duel_1v1` — командный дуэльный режим с жестким ограничением:
  - максимум 2 игрока в комнате;
  - старт только при составе `A=1` и `B=1`;
  - нельзя занять уже занятую команду.
- `solo_arena` — FFA.
- `turbo_storm` — ускоренный таймер и бонус за правильный ответ.
- `combo_rush` — FFA с комбо-механикой.
