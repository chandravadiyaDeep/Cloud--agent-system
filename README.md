# Cloud Agent System

A mobile-first Telegram command bot running on Cloudflare Workers, with task persistence in Cloudflare D1.

## Current scope

- Telegram webhook endpoint at `/telegram`.
- Health endpoint at `/health`.
- Basic commands: `/start`, `/help`, `/status`, and `/task <description>`.
- D1-backed task and update history.
- Telegram webhook secret validation.
- Optional Telegram user allowlist.

This is a lightweight Cloudflare-native agent foundation. It is **not** the full OpenClaw Gateway and does not execute arbitrary shell commands or autonomous actions.

## Required Cloudflare bindings and secrets

### D1 binding
Create a D1 database and bind it to this Worker with:

- Variable name: `DB`

Apply `migrations/0001_initial.sql` to that database using the D1 console or Wrangler.

### Secrets
Add these under Worker → Settings → Variables and Secrets:

- `TELEGRAM_BOT_TOKEN` — token from BotFather. If a token was exposed, revoke it with BotFather and use a replacement.
- `TELEGRAM_WEBHOOK_SECRET` — random string of 1–256 characters, used to validate Telegram webhook requests.

### Optional variable
- `ALLOWED_TELEGRAM_USER_ID` — your numeric Telegram user ID. When set, only that Telegram user can use the bot. Find your numeric ID using a trusted Telegram ID bot; do not use your bot token with third-party sites.

## Deploy

This repository is intended to be connected to an existing Cloudflare Worker through Workers Builds.

The Worker code expects the D1 binding named `DB` to be configured in the Cloudflare dashboard. If you use Wrangler configuration later, add the actual D1 database ID from your Cloudflare account; never guess it.

## Configure Telegram webhook

After deployment, set the webhook URL to:

`https://<your-worker-subdomain>.workers.dev/telegram`

Use Telegram's `setWebhook` API with the `secret_token` parameter set to the exact value of `TELEGRAM_WEBHOOK_SECRET`. Keep the bot token out of source code, GitHub, screenshots, and chat messages.

## Endpoints

- `GET /health` — health check.
- `POST /telegram` — Telegram webhook.

## Security notes

- Never commit bot tokens, webhook secrets, API keys, or private keys.
- Keep the Worker dashboard and account protected with two-factor authentication.
- The bot only stores task text sent by the authorized user.
- No arbitrary code execution, shell access, or external account actions are implemented.
