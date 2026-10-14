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

The mobile app currently calls `https://binercraft.ir/api` directly.

## Routes

- `GET /health`
- `POST /auth/demo` — creates a unique test user and returns a bearer token. It is not SMS verification.
- `GET /auth/me` — current profile
- `PATCH /auth/profile` — update display name, username, avatar URL, birth year/calendar
- `POST /auth/logout` — revoke current token
- `GET /conversations` — conversations for the signed-in user
- `POST /conversations` — create a group or channel using `{ "type": "group"|"channel", "title": "...", "description": "..." }`
- `GET /users/search?q=ali` — search users by username or display name (minimum 2 characters)
- `POST /conversations/direct` — start or retrieve a private conversation with `{ "username": "other_user" }`
- `GET /conversations/members?id=123` — list members when you belong to the conversation
- `POST /conversations/join` — join a group/channel by numeric conversation ID
- `POST /conversations/leave` — leave a group/channel (owners must transfer ownership first)
- `POST /conversations/add-member` — owner/admin adds a user by username
- `GET /messages?conversation_id=123&limit=50&before_id=500` — read recent messages or paginate older messages
- `POST /messages` — send `{ "conversation_id": 123, "body": "..." }`
- `PATCH /messages/edit` — edit your own message with `{ "message_id": 123, "body": "..." }`
- `POST /messages/delete` — delete your own message, or a message as a conversation owner/admin

Protected routes require `Authorization: Bearer <token>`.

## Limitations

- Demo login is for development only and does not verify identity. Set `demo_login_enabled` to `false` before a public launch until a real authentication flow is configured.
- User search, private conversation creation, membership management, message editing/deletion, and paginated message reads are available in this API, but the mobile screens still need to expose all of them.
- This shared-hosting version uses REST polling/manual refresh, not WebSocket push. Real SMS OTP, contact sync, media upload, push notifications, message read receipts, blocking/reporting, and end-to-end encryption are not implemented.
- Never commit real passwords or bearer tokens. Restrict database user privileges and keep backups.


## Username/password accounts

New installations must use the latest `schema.sql`, which includes `users.password_hash`.
For an existing cPanel/MariaDB database, run this one-time migration in phpMyAdmin after selecting the Vatan database:

```sql
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER username;
```

The app now uses `POST /auth/register` and `POST /auth/login`. Passwords are stored with PHP's `password_hash()` and checked with `password_verify()`; the API never returns password hashes. The old `/auth/demo` endpoint is disabled. Existing demo accounts have no password hash, so they cannot sign in with a password; register a new username unless an administrator securely provisions a password for the existing account.

Messages are saved in MariaDB. Members of a group can read its shared history, and the app polls for new messages and conversation membership. This is periodic REST refresh, not instant WebSocket delivery.
