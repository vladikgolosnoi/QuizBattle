# QuizBattle Sber Edition

Портфолио-проект по кейсу Сбера: веб-сервис для командной викторины в реальном времени с AI-генерацией вопросов, PIN-комнатами, аналитикой и рейтингом.

## Навигация по документации

- Пользовательская: [`docs/USER_GUIDE_RU.md`](/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/docs/USER_GUIDE_RU.md)
- Разработчика: [`docs/DEVELOPER_GUIDE_RU.md`](/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/docs/DEVELOPER_GUIDE_RU.md)
- Деплой: [`docs/DEPLOYMENT_RU.md`](/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/docs/DEPLOYMENT_RU.md)
- Соответствие ТЗ: [`docs/TZ_COMPLIANCE_RU.md`](/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/docs/TZ_COMPLIANCE_RU.md)
- Скрипт защиты: [`docs/PRESENTATION_SCRIPT_RU.md`](/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/docs/PRESENTATION_SCRIPT_RU.md)

## Соответствие ТЗ

- Обязательная часть ТЗ реализована полностью.
- Дополнительная часть реализована расширенно (AI, админ-панель, FFA, темная тема, звук, профили, рейтинг, экспорт, история).
- Подробная матрица: [`docs/TZ_COMPLIANCE_RU.md`](/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/docs/TZ_COMPLIANCE_RU.md)

## Ключевые возможности

- Разделы интерфейса: `Играть`, `Комнаты`, `Аккаунт`, `Друзья`, `Лидерборд`, `История`.
- Комнаты по уникальному `PIN` (`A-Z0-9`, 6 символов) и ссылке-приглашению.
- Отдельный каталог комнат (`Комнаты`) с поиском и быстрым входом в активные лобби.
- Роли: ведущий и игроки, авторазделение на команды `A/B`.
- Форматы: `Команды A/B` и `Все против всех (FFA)`.
- Игровые режимы: `Командная дуэль`, `Дуэль 1 на 1`, `Соло-арена`, `Турбо-шторм`, `Комбо-гонка`.
- Поочередные раунды, таймер, 4 варианта ответа, realtime-обновление счета.
- Умные тематические иллюстрации к вопросам (автоподбор + fallback без блокировки матча).
- Панель ведущего: пауза, следующий вопрос, пропуск, дисквалификация.
- Устойчивость соединения: автопереподключение ведущего и игроков.
- Пароль на комнату.
- Экспорт результатов матча в JSON.
- Постматчевая аналитика: сложные вопросы, дисциплина команд, статистика игроков.
- Регистрация, вход, профили, лидерборд и история матчей (SQLite).
- Адаптивный UI для мобильных и ПК в фирменной Sber-палитре.

## AI-генерация

- Дефолтный режим: `hybrid` (сервер управляет провайдерами без выбора на клиенте).
- Доступные провайдеры: `YandexGPT`, `GigaChat`, `Gemini`, `Groq`, `OpenAI`.
- В `hybrid` вопросы собираются из нескольких провайдеров с валидацией качества и дедупликацией.
- Если внешний AI недоступен, включается локальный fallback, и матч не падает.
- В фиксированных режимах сложности (`easy/medium/hard`) сервер удерживает заданную сложность в итоговом пакете.

## Технологии

- `Frontend`: React, TypeScript, Vite, Socket.IO client.
- `Backend`: Node.js, Express, Socket.IO server.
- `Persistence`: SQLite (`better-sqlite3`) для профилей, истории и рейтинга.
- `AI`: YandexGPT, GigaChat, Gemini, Groq, OpenAI + локальный fallback.

## Быстрый запуск

```bash
cd /Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio
npm install
npm run dev
```

- Клиент: `http://localhost:5175` (через root-скрипт)
- Сервер: `http://localhost:4000`

## Конфигурация

Создай `/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/server/.env` на основе `/Users/vladikgolosnoi/Desktop/тамагочи/quizbattle-portfolio/server/.env.example`.

Пример:

```env
PORT=4000
CLIENT_URL=http://localhost:5175
SERVER_AI_MODE=hybrid

YC_API_KEY=
YC_FOLDER_ID=

GIGACHAT_AUTH_KEY=
GIGACHAT_SCOPE=GIGACHAT_API_PERS

GEMINI_API_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=

QUESTION_IMAGES_ENABLED=true
```

## Проверки качества

```bash
npm run lint
npm run build
```

## Полезные эндпоинты

- `GET /health` — здоровье сервера и активные комнаты.
- `GET /meta` — доступность AI-провайдеров и каталог режимов.
- `GET /api/rooms` — каталог активных комнат с фильтрами (`status`, `q`, `format`, `limit`).
- `POST /api/auth/register` — регистрация.
- `POST /api/auth/login` — вход.
- `GET /api/leaderboard` — рейтинг.
- `GET /api/history` — история игр.
- `GET /api/profile/:username` — профиль и матчи игрока.

## Команда

- Владислав Голосной — продукт, фронтенд, бэкенд, AI-интеграции, архитектура, защита.
