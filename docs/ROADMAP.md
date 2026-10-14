# VATANMSG development roadmap

## Stage 1 — PHP hosting foundation
- [x] React Native / Expo / TypeScript app shell
- [x] Persian/English interface and light/dark themes
- [x] PHP 8.2 REST API for cPanel shared hosting
- [x] MariaDB schema and migration guide
- [x] Bearer-token demo sign-in, profile read/update and logout
- [x] Group/channel creation and membership authorization
- [x] Message send/history endpoints
- [x] Mobile API client points to `https://binercraft.ir/api`
- [x] Mobile UI connected for demo sign-in, profile updates, group/channel creation and message polling
- [ ] Deploy the current `php-api/` files to cPanel and verify the live health endpoint
- [ ] Run PHP syntax checks and mobile TypeScript checks

## Stage 2 — Hosting validation and secure identity
- Apply `php-api/upgrade-existing.sql` carefully if the prototype database already exists.
- Disable demo login after testing until a real authentication flow is implemented.
- Store session tokens in secure device storage and restore/revoke sessions safely.
- Add phone-number OTP using a selected provider, with rate limits, expiry and replay protection.
- Add API abuse protection, monitoring and request logging without logging secrets.

## Stage 3 — Messaging and communities
- Add direct/private conversation creation and safe member invitations.
- Add group member management, roles, moderation and channel publishing controls.
- Add pagination, read receipts, typing indicators and message editing/deletion.
- Add media uploads with size/type validation and push notifications.

## Stage 4 — Production hardening
- Automated PHP/API contract and authorization tests plus CI.
- HTTPS, least-privilege database access, backups and recovery drills.
- Privacy policy, data retention/deletion, account deletion and store compliance.
- Security review and load testing before public release.

## Current limitations
- The cPanel target uses REST and polls the open conversation every five seconds; it does not currently push messages over WebSockets.
- Demo sign-in is not phone-number verification.
- Direct messages, contact sync, media upload, push notifications and end-to-end encryption are not implemented.
- The older `server/` Node.js implementation is retained as a reference, but it is not required for the cPanel deployment.

**Security note:** do not use demo authentication for public accounts or describe the app as production-ready until authentication, token storage, abuse protection and deployment checks are complete.
