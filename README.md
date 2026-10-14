# پیام‌رسان وطن | Vatan Messenger

A cross-platform messenger project built with **React Native + Expo + TypeScript**, with a **Node.js + TypeScript + MySQL/MariaDB** backend.

## Repository status

This is an actively developed staged prototype. The mobile app has a bilingual Persian/English UI, light/dark themes, profile editing and local group/channel creation. The backend now includes a MySQL schema, development-only demo sign-in, profile/conversation REST endpoints, and authenticated Socket.IO message persistence/broadcast logic. The mobile API and Socket.IO client helpers are present, but the current screens are **not yet wired to those services**.

## Mobile app

1. Install a supported Node.js LTS version.
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_VATAN_API_URL`.
4. Start Expo: `npx expo start`

For a physical phone, set the API URL to your computer's reachable LAN IP (not `localhost`). Use HTTPS in deployed environments.

## Backend

See [server/README.md](server/README.md).

1. Create a local `server/.env` from `server/.env.example`; replace all placeholders.
2. Apply `server/db/schema.sql` to your MySQL/MariaDB instance.
3. Create a restricted database account for the app.
4. In `server/`, run `npm install`, then `npm run typecheck`, then `npm run dev`.

Health check: `GET /health`.

## Current backend routes

- `POST /api/auth/demo` — development-only test account and signed bearer token
- `GET/PATCH /api/me` — read/update profile
- `GET /api/conversations` — list joined groups/channels
- `POST /api/groups` and `POST /api/channels` — create a group/channel
- `GET /api/conversations/:id/messages` — fetch recent conversation messages
- Socket.IO `conversation:join` and `message:send` — authenticated membership checks and persisted real-time messages

## Not production-ready yet

- Demo login is not phone-number verification. It is disabled in production and the server refuses to start if demo login is enabled in production.
- Mobile screens still use local demo state; connect them to `src/services/api.ts` and `src/services/realtime.ts` in the next stage.
- Real SMS OTP, secure on-device token storage, direct-message creation, contact sync, invitations/member management, push notifications, media uploads, moderation, end-to-end encryption, CI and automated tests remain unfinished.
- The app has **no end-to-end encryption** at this stage. Do not describe it as encrypted end-to-end.
- Before public deployment, configure HTTPS/WSS, production authentication, strict origins, secret management, database backups, monitoring, and abuse protection.

Never commit real credentials, tokens, signing keys, database passwords, or other secrets to GitHub.
