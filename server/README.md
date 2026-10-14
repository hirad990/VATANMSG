# VatanMSG API (development stage)

Node.js + TypeScript + Express + Socket.IO + MySQL/MariaDB.

## Prerequisites

- Node.js 20+
- MySQL 8+ or a compatible MariaDB release
- A dedicated database user with permissions limited to the `vatanmsg` database

## Setup

1. Create a local `.env` file from `.env.example` and replace every placeholder.
2. Create the schema: `mysql -u YOUR_ADMIN_USER -p < db/schema.sql`
3. Create a restricted MySQL application user and grant it access only to the `vatanmsg` database. Do not run the app as the database root user.
4. Install packages: `npm install`
5. Check types: `npm run typecheck`
6. Run development server: `npm run dev`

Health check: `GET http://localhost:4000/health`

## Current endpoints

- `POST /api/auth/demo` — development-only demo identity and signed bearer token
- `GET /api/me` — current user profile
- `PATCH /api/me` — update profile fields
- `GET /api/conversations` — list the current user's groups/channels
- `POST /api/groups` — create a group; creator becomes owner
- `POST /api/channels` — create a channel; creator becomes owner
- `GET /api/conversations/:id/messages` — fetch recent messages for members
- Socket.IO `conversation:join` — join a room after membership check
- Socket.IO `message:send` — validate, persist and broadcast a message to members in the joined room

For REST requests after demo login, send `Authorization: Bearer <token>`. For Socket.IO, provide `auth: { token }`.

## Deliberate limitations

- Demo sign-in is not real phone verification. It is refused in production, and production startup fails if `DEMO_LOGIN_ENABLED=true`.
- This is an initial backend scaffold, not production-ready messaging. Real phone OTP, push notifications, media upload, contact sync, moderation, message pagination, group invitations, role-management endpoints, and automated integration tests remain to be implemented.
- Configure HTTPS/WSS, strict origin allowlists, secret management, database backups, monitoring, and rate limits before public deployment.
- No end-to-end encryption is implemented. Do not represent the current system as end-to-end encrypted.
- SQL queries use parameter placeholders. Do not interpolate untrusted values into SQL strings.
