# VATANMSG development roadmap

## Stage 1 — Repository foundation (current)
- [x] React Native / Expo / TypeScript app shell
- [x] Bilingual Persian/English interface and theme switch
- [x] Local prototype group/channel/profile flows
- [x] Node.js + TypeScript API scaffold
- [x] MySQL/MariaDB relational schema
- [x] Development-only demo authentication
- [x] REST routes for profile, groups, channels and message history
- [x] Socket.IO authenticated connection and message persistence/broadcast logic
- [ ] CI typecheck/build and automated tests
- [ ] Connect mobile UI to API and Socket.IO

## Stage 2 — Connect the app
- Add an environment-configured API URL and typed client.
- Replace local group/channel creation with authenticated API calls.
- Add demo sign-in UI and secure token handling on-device.
- Load profile/conversation history from the API.
- Build a conversation screen and handle Socket.IO connection/reconnection states.
- Add API contract and authorization tests.

## Stage 3 — Identity and profiles
- Add phone-number OTP through a selected SMS provider.
- Rate-limit OTP creation and verification, set expiry, and prevent replay.
- Add unique username updates, avatar upload/storage, and proper birth-date validation.
- Store auth tokens in platform secure storage and add logout/revocation.

## Stage 4 — Messaging and communities
- Direct conversations, group invitations, member lists, roles and moderation.
- Channel publishing permissions, pagination, read receipts and typing indicators.
- Push notifications for Android/iOS; image/file upload with size/type checks.
- Report/block flows and abuse prevention.

## Stage 5 — Release hardening
- Integration tests, CI, dependency audits and migration strategy.
- TLS/WSS, production secrets, least-privilege database account, backups and observability.
- Privacy policy, data retention/deletion, account deletion and app-store compliance.
- Security review and load testing before launch.

**Security note:** do not enable public access to the API until demo login is disabled and production authentication/authorization, HTTPS, monitoring, and deployment configuration have been reviewed.
