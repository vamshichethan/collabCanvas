# CollabCanvas Deployment

## Local Services

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Backend setup:

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

Frontend setup:

```bash
npm install
npm run dev
```

## Render Backend

Use the backend folder as the service root.

Required environment variables:

- `DATABASE_URL`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- `JWT_SECRET`
- `COOKIE_SECRET`
- `GEMINI_API_KEY`
- `REDIS_URL` or `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`
- `NODE_ENV=production`

Build command:

```bash
npm ci && npm run prisma:generate && npm run build
```

Start command:

```bash
npm run prisma:deploy && npm run start
```

Free Render services may sleep, which can temporarily disconnect Socket.IO users. The app reconnects and requests missed operations after wake-up.

## Multi-Instance Test

Run two backend instances with the same `DATABASE_URL` and Redis config on different ports, then connect two frontend sessions with different `VITE_SOCKET_URL` values. Redis Pub/Sub should deliver room events across both instances while PostgreSQL remains the source of truth.

## Health Check

Use:

```bash
curl http://localhost:5000/api/health
```

Expected fields include PostgreSQL status, Redis status, socket adapter, and instance id.
