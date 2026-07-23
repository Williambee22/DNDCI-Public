# Drum Corps Online 3.0

A server-authoritative, human-only multiplayer drum corps management game. Every director manages a private corps while the lobby shares readiness, contest information, standings, and season history.

## Multi-season leagues

- A lobby can continue through unlimited seasons.
- World Championship Finals automatically creates a permanent season archive.
- Every participant receives that recap on their account.
- Archives include all ten contests, every score, final standings, each player's score timeline, staff, finances, fans, and legacy.
- Players can reopen or download saved recap files from the account dashboard.
- Lobby deletion does not remove completed recaps from player accounts.
- The lobby creator receives a **Next Season** button after Finals.

## What carries into the next season

The corps keeps its cash, facilities, staff, fans, interest, reputation, legacy, name, home city, competitive strength, food preference, and tour preference. The new annual preseason resets the show title and design, sponsor agreement, roster, training plan, fundraising uses, weekly results, morale pressure, and injuries.

## Staff office

- Six role-specific positions affect their assigned scoring or operational areas.
- Every player receives a private randomized staff market each season.
- Candidate OVR ratings range from 45 through 99.
- Higher ratings cost more and provide stronger caption or operational effects.
- Retained staff stay with the corps between seasons.
- Retained contracts must be renewed before the corps can mark ready.
- Directors can fire staff, hire replacements, and refresh the candidate market twice per season.

## Recruiting and fans

Fan growth now has a direct recruiting benefit. Larger fanbases improve the talent level available during auditions, while corps interest, recruiting facilities, home-region strength, and caption-head OVR continue to matter.

## Simplified game flow

The preseason has five required plans:

1. Identity
2. Money
3. Staff office
4. Show and members
5. Tour plan

Directors can complete them manually or use **Recommended Setup** to fill only missing requirements.

## Economy

- First-year opening budget: **$150,000**
- Future seasons carry forward the previous ending balance
- Sponsor grants and weekly support
- Visible food, staff, design, recruiting, training, travel, and housing costs
- Optional facilities and up to three fundraisers each season
- A private transaction ledger with the running balance

## Multiplayer safety

- Every player has a separate private corps object and revision number.
- Actions are applied to cloned records and committed atomically.
- Another player's update cannot overwrite your private changes.
- Action IDs prevent duplicate charges from retries or double-clicks.
- Lobby mutations are serialized on the server.
- Only public corps information appears in other players' views.
- Only the lobby creator can delete the lobby or open the next season.

## Railway deployment

See [`RAILWAY_DEPLOY.md`](RAILWAY_DEPLOY.md). The repository includes a `Dockerfile`, `railway.toml`, `/health` endpoint, persistent-volume support, and graceful shutdown handling.

## Local development

```bash
npm run check
npm test
npm start
```

Open `http://localhost:3000`.
