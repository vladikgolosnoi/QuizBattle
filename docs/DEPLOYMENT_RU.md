# Деплой QuizBattle

## Вариант A: Быстрый облачный деплой (Render)

Этот вариант нужен для демо по ссылке без поднятия VPS вручную.

1. Пуш в GitHub (ветка `main`) c файлом `render.yaml`.
2. В Render: `New +` -> `Blueprint` -> выбери репозиторий `QuizBattle`.
3. Нажми `Apply` для создания сервиса `quizbattle`.
4. В `Environment` заполни ключи моделей (`YC_API_KEY`, `YC_FOLDER_ID`, `GIGACHAT_*`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`) по необходимости.
5. После первого деплоя получишь URL вида `https://quizbattle.onrender.com`.

Привязка домена `vladikgolosnoi.ru`:

1. В Render у сервиса: `Settings` -> `Custom Domains` -> `Add Domain`.
2. В REG.RU добавь DNS-записи, которые покажет Render (обычно `CNAME`/`A`).
3. Дождись валидации SSL (обычно 5-20 минут).

## Вариант B: VPS + Nginx

## 1. Подготовка сервера

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Клонирование и установка

```bash
git clone <repo_url> /opt/quizbattle-portfolio
cd /opt/quizbattle-portfolio
npm install
npm install --prefix server
npm install --prefix client
```

## 3. Конфиг окружения

Создай:

`/opt/quizbattle-portfolio/server/.env`

Пример:

```env
PORT=4000
CLIENT_URL=https://your-domain.ru
SERVER_AI_MODE=hybrid

YC_API_KEY=your_yandex_key
YC_FOLDER_ID=your_folder_id

GIGACHAT_AUTH_KEY=your_gigachat_auth_key
GIGACHAT_SCOPE=GIGACHAT_API_PERS

GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key
```

## 4. Сборка клиента

```bash
npm run build --prefix client
```

## 5. Запуск backend через systemd

Создай unit:

`/etc/systemd/system/quizbattle.service`

```ini
[Unit]
Description=QuizBattle Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/quizbattle-portfolio/server
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
User=www-data
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Запуск:

```bash
sudo systemctl daemon-reload
sudo systemctl enable quizbattle
sudo systemctl start quizbattle
sudo systemctl status quizbattle
```

## 6. Nginx

Пример конфига:

`/etc/nginx/sites-available/quizbattle`

```nginx
server {
    listen 80;
    server_name your-domain.ru;

    root /opt/quizbattle-portfolio/client/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000/health;
    }

    location /meta {
        proxy_pass http://127.0.0.1:4000/meta;
    }
}
```

Активация:

```bash
sudo ln -s /etc/nginx/sites-available/quizbattle /etc/nginx/sites-enabled/quizbattle
sudo nginx -t
sudo systemctl reload nginx
```

## 7. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.ru
```

## 8. Экспорт результатов

- Сервер сохраняет JSON-отчеты матчей автоматически в каталог `exports` внутри `WorkingDirectory`.
- Для текущего unit из примера путь будет: `/opt/quizbattle-portfolio/server/exports`.
