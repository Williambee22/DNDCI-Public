# Deploy Drum Corps Online to Railway

The project is configured for Railway with:

- A root-level `Dockerfile`
- A root-level `railway.toml`
- A `/health` readiness endpoint
- Automatic use of Railway's assigned `PORT`
- Persistent save support through a Railway Volume
- Graceful shutdown on redeploy

## Fastest deployment

1. Put all files from this folder at the root of a GitHub repository.
2. In Railway, create a new project and choose **Deploy from GitHub repo**.
3. Select the repository. Railway will detect the `Dockerfile` automatically.
4. Open the new service and add a **Volume**.
5. Set the volume mount path to:

   ```text
   /app/data
   ```

6. Open **Settings → Networking** and click **Generate Domain**.
7. Wait for `/health` to pass and open the generated domain.

No custom build command, start command, or `PORT` variable is required.

## Recommended Railway variables

These are optional because safe defaults are included:

```text
SESSION_DAYS=14
MIN_PLAYERS=2
COOKIE_SECURE=1
```

Do not manually set `DATA_FILE` when the volume is mounted at `/app/data`. The Docker image already uses `/app/data/db.json`.

## Important persistence warning

The application stores accounts, sessions, lobbies, scores, and history in one JSON file. Without the Railway Volume mounted at `/app/data`, the service can run, but its data may disappear after a redeploy or restart.

Use only one replica. The JSON storage layer is intentionally single-process and is not designed for horizontal replicas writing to the same file.

## Local test

```bash
npm run check
npm test
npm start
```

Open `http://localhost:3000`.

## Docker test

```bash
docker build -t drum-corps-online .
docker run --rm -p 3000:3000 \
  -e COOKIE_SECURE=0 \
  -v "$(pwd)/data:/app/data" \
  drum-corps-online
```
