# پیام‌رسان وطن | Vatan Messenger

Vatan is a cross-platform messenger prototype built with **React Native + Expo + TypeScript**. The deployed backend target is **PHP 8.2 + MariaDB on cPanel**.

## Mobile app

```bash
npm install
npx expo start
```

The API client defaults to `https://binercraft.ir/api`. To override it for another environment, set `EXPO_PUBLIC_VATAN_API_URL` in the Expo environment.

## PHP API deployment

The complete cPanel-compatible API is in [`php-api/`](php-api/).

1. Create `public_html/api/` in cPanel File Manager.
2. Upload the contents of `php-api/` into that directory.
3. Copy `config.example.php` to `config.php` on the host only.
4. Set the host's database name, database username, and password in `config.php`. Never commit the real configuration.
5. For a fresh database, run `php-api/schema.sql` in phpMyAdmin.
6. If you already created the earlier prototype tables, inspect them and run only the necessary statements from `php-api/upgrade-existing.sql`. Skip any ALTER statement for a column that already exists.
7. Open `https://binercraft.ir/api/health`; it should return JSON.

Required PHP extensions: `pdo_mysql` and `mbstring`. Use HTTPS.

## Implemented API routes

- `GET /health`
- `POST /auth/demo` — test account only; not phone verification
- `GET /auth/me`
- `PATCH /auth/profile`
- `POST /auth/logout`
- `GET /conversations`
- `POST /conversations` — create group or channel
- `GET /conversations/members?id=123`
- `GET /messages?conversation_id=123&limit=50`
- `POST /messages`

Protected routes use `Authorization: Bearer <token>`.

## Current state and limitations

- The React Native UI now calls the PHP API for demo sign-in, profile changes, conversation lists, group/channel creation, and message send/read.
- The app polls open conversations for new messages every five seconds because ordinary shared PHP hosting does not necessarily support persistent WebSockets.
- Demo sign-in is not SMS OTP. Disable it in the host's `config.php` after testing until real phone verification is implemented.
- The app currently keeps the bearer token in memory; a reload requires signing in again. Add secure device storage before production.
- Direct/private conversation creation, contact sync, media upload, push notifications, moderation, end-to-end encryption, and production account recovery are not implemented.
- The previous `server/` Node.js backend remains in the repository as a development/reference implementation; the cPanel deployment described here uses `php-api/`.

Never commit real database passwords, API tokens, or signing secrets.
