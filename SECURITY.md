# Security and multiplayer state

- Passwords use Node.js `scrypt` with a unique salt.
- Authentication uses HTTP-only, SameSite cookies.
- Production cookies can be forced secure with `COOKIE_SECURE=1`.
- Login attempts are rate-limited in memory.
- All game rules and private state live on the server.
- Other players receive only public corps identity, readiness, and score data.
- Every corps has an independent revision number.
- Mutations use optimistic revision checks, action IDs, cloned state, and per-lobby serialization.
- Lobby deletion is restricted to the account that created the lobby.
- JSON writes are atomic within one server process.

Run only one Railway replica while using the included JSON storage layer. A multi-replica deployment requires replacing `storage.js` with a shared transactional database.
