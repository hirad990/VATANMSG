# پیام‌رسان وطن | Vatan Messenger

A cross-platform messaging app starter built with **React Native + Expo + TypeScript**, designed for iOS and Android.

## Current prototype

- Persian and English interface with RTL/LTR switching
- Chats, contacts, groups, and channels navigation
- Create-group and create-channel flows (local demo state)
- Profile editing: display name, username, birth date, calendar preference
- Light/dark theme selection
- Profile photo selection using the device photo library
- Responsive native UI with accessible touch targets

## Run locally

1. Install Node.js LTS.
2. Install dependencies: `npm install`
3. Start Expo: `npx expo start`
4. Open the QR code with Expo Go, or press `a` / `i` for an available emulator.

## Important: production backend still required

This repository starts with a **front-end prototype**. Real phone-number authentication, SMS OTP delivery, private messaging, persistent user profiles, group membership, channel permissions, push notifications, media storage, and contact discovery require a secure backend and provider configuration. The current demo stores prototype changes only in app memory and must not be treated as a production messenger.

Recommended next stage:
- API/backend: Node.js + PostgreSQL
- Authentication: phone number + expiring OTP with rate limits
- Realtime messaging: WebSocket gateway
- Media: private object storage with signed URLs
- Push: Expo Notifications / APNs / FCM
- Security: server-side authorization, input validation, abuse controls, and privacy-conscious contact matching

Never commit SMS provider credentials, database passwords, signing keys, or other secrets to GitHub.
