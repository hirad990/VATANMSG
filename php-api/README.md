# Vatan Messenger PHP API (cPanel)

This is the PHP 8.2 + MariaDB backend for the React Native app. It does not require Node.js on the hosting account.

## Deploy to cPanel

1. In cPanel File Manager, create `public_html/api/`.
2. Upload the contents of this folder into that directory (not the folder itself).
3. Copy `config.example.php` to `config.php` on the host.
4. Edit only the host's `config.php` and enter the cPanel database name, database user, and password. Do not commit the real config file.
5. In phpMyAdmin, select the target database. For a fresh database, run `schema.sql`.
6. If using tables created by the earlier prototype schema, inspect their columns and run only the necessary statements in `upgrade-existing.sql`; skip ALTER statements for columns that already exist.
7. Verify `https://binercraft.ir/api/health` returns JSON.

PHP extensions required: `pdo_mysql`, `mbstring`. HTTPS must be enabled.

## API base URL

The mobile app uses `https://binercraft.ir/api` by default. Override with `EXPO_PUBLIC_VATAN_API_URL` only for a different deployment.

## Routes

- `GET /health`
- `POST /auth/demo` — creates a unique test user and returns a bearer token. It is not SMS verification.
- `GET /auth/me` — current profile
- `PATCH /auth/profile` — update display name, username, avatar URL, birth year/calendar
- `POST /auth/logout` — revoke current token
- `GET /conversations` — conversations for the signed-in user
- `POST /conversations` — create a group or channel using `{ "type": "group"|"channel", "title": "...", "description": "..." }`
- `GET /conversations/members?id=123`
- `GET /messages?conversation_id=123&limit=50`
- `POST /messages` — send `{ "conversation_id": 123, "body": "..." }`

Protected routes require `Authorization: Bearer <token>`.

## Limitations

- Demo login is for development only. Set `demo_login_enabled` to `false` after testing until real phone OTP is implemented.
- This shared-hosting version uses REST polling/manual refresh, not WebSocket push. Instant delivery, SMS OTP, direct conversations, contact sync, media upload, push notifications, and end-to-end encryption are not implemented.
- Never commit real passwords or bearer tokens. Restrict database user privileges and keep backups.
