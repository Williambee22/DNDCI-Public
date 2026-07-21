# Security notes

The uploaded Discord bot source contained a bot token directly in the Python file. Treat that token as compromised:

1. Regenerate/reset it in the Discord Developer Portal.
2. Remove it from every code copy and Git history.
3. Load the replacement from an environment variable such as `DISCORD_BOT_TOKEN`.
4. Never send the token to the browser or commit it to a repository.

This web project stores password hashes using Node's `scrypt`, issues HttpOnly SameSite session cookies, and sends only public opponent summaries to each lobby member. For HTTPS hosting, set `COOKIE_SECURE=1`.
