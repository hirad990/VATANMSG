# VATANMSG development roadmap

## Stage 1 — Repository foundation (initial scaffold committed)
- [x] React Native / Expo / TypeScript app shell
- [x] Bilingual Persian/English interface and theme switch
- [x] Local prototype group/channel/profile flows
- [x] Node.js + TypeScript API scaffold
- [x] MySQL/MariaDB relational schema
- [x] Development-only demo authentication (disabled in production)
- [x] REST routes for profile, groups, channels and message history
- [x] Socket.IO authenticated connection and message persistence/broadcast logic
- [x] Typed mobile REST and Socket.IO client helpers
- [ ] Run backend/mobile typechecks and add CI + automated tests
- [ ] Connect the mobile UI to API and Socket.IO

## Stage 2 — Connect the app
- Replace local group/channel creation with authenticated API calls.
- Add a demo sign-in screen and secure token storage on-device.
- Load profile and conversation history from the API.
- Build a conversation screen and handle Socket.IO connection/reconnection states.
- Add API contract and authorization tests.

## Stage 3 — Identity and profiles
- Add phone-number OTP through a selected SMS provider.
- Rate-limit OTP creation and verification, set expiry, and prevent replay.
- Add unique username updates, avatar upload/storage, and full birth-date validation.
- Add logout/token revocation and account recovery.

## Stage 4 — Messaging and communities
- Direct conversations, group invitations, member lists, roles and moderation.
- Channel publishing permissions, pagination, read receipts and typing indicators.
- Push notifications for Android/iOS; image/file upload with size/type checks.
- Report/block flows and abuse prevention.

## Stage 5 — Release hardening
- Integration tests, CI, dependency audits and database migrations.
- TLS/WSS, production secrets, least-privilege database account, backups and observability.
- Privacy policy, data retention/deletion, account deletion and app-store compliance.
- Security review and load testing before launch.

**Security note:** do not expose the API publicly until demo login is disabled and production authentication/authorization, HTTPS, monitoring, and deployment configuration have been reviewed.

