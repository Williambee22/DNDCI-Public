# Drum Corps Online

A server-authoritative multiplayer drum corps management game. Each player manages a private corps dashboard while competing in a shared lobby and ten-week season.

## Railway deployment

See [`RAILWAY_DEPLOY.md`](RAILWAY_DEPLOY.md). The repository already contains a `Dockerfile`, `railway.toml`, `/health` endpoint, persistent-volume support, and graceful shutdown handling.

## Local development

```bash
npm run check
npm test
npm start
```

Open `http://localhost:3000`.
