# Drum Corps Online 2.0

A server-authoritative, human-only multiplayer drum corps management game. Every director manages a private corps while the lobby shares readiness, contest information, standings, and history.

## Simplified game flow

The preseason now has five required plans:

1. Identity
2. Money
3. Core staff
4. Show and members
5. Tour plan

Directors can complete the required plans manually or use **Recommended Setup** to fill only the missing requirements.

## Economy

- First-year opening budget: **$150,000**
- One sponsor agreement with an up-front grant and weekly support
- One food plan with a visible weekly cost
- Six core staff salaries paid once per season
- Optional facilities and up to three fundraisers
- One-time show-design, audition-season, and spring-training costs
- Travel, housing, and food charged each tour week
- A private money ledger records every transaction and running balance

## Multiplayer safety

- Every player has a separate private corps object and revision number.
- Player actions are applied to a cloned corps record and committed atomically.
- Another player's update does not invalidate your private revision.
- Action IDs prevent double charges from retries or double-clicks.
- Lobby mutations are serialized on the server.
- Only public corps information appears in other players' lobby views.
- Only the lobby creator can permanently delete the lobby.

## Tour

The season contains ten named contests from the season premiere through World Championship Finals. Every week has one shared tour situation and a separate private choice for each director. Situations include weather, transportation, housing, meals, illness, staff disputes, equipment problems, rehearsal sites, sponsor appearances, show rewrites, and competitive gambles.

## Railway deployment

See [`RAILWAY_DEPLOY.md`](RAILWAY_DEPLOY.md). The repository already includes a `Dockerfile`, `railway.toml`, `/health` endpoint, persistent-volume support, and graceful shutdown handling.

## Local development

```bash
npm run check
npm test
npm start
```

Open `http://localhost:3000`.
