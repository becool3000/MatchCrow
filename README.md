# MatchCrow

MatchCrow is a pixel-art match-3 score chaser built with Phaser, TypeScript, and Vite.

## Run

```powershell
npm install
npm run dev
```

## Firebase Leaderboard

The client reads and submits leaderboard scores directly against Firestore.

1. Copy `.env.example` to `.env`
2. Fill in the Firebase web app values from the Firebase console
3. Deploy the backend with Firebase CLI

Top-score writes are constrained by `firestore.rules`.

## Build

```powershell
npm run build
```

## Test

```powershell
npm run test
```
