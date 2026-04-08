# MatchCrow

MatchCrow is a pixel-art match-3 score chaser built with Phaser, TypeScript, and Vite.

## Run

```powershell
npm install
npm run dev
```

## Firebase Leaderboard

The client reads leaderboard scores from Firestore and submits high scores through the deployed Firebase HTTP function.

1. Copy `.env.example` to `.env`
2. Fill in the Firebase web app values from the Firebase console
3. Deploy Firestore rules and the Firebase functions backend with Firebase CLI

## Build

```powershell
npm run build
```

## Test

```powershell
npm run test
```
