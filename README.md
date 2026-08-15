<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/876e0c0d-c855-474e-8b1f-7e7309c3fe74

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Copy the `VITE_FIREBASE_*` keys from [.env.example](.env.example) into
   `.env.local` and fill them in from the Firebase Console (Project settings >
   Your apps > SDK setup). `src/utils/firebase.ts` reads them at import time, so
   the app will not boot without them.
4. Run the app:
   `npm run dev`

## Firebase Realtime Database security rules

[database.rules.json](database.rules.json) is the **source of truth** for the
Realtime Database security rules that gate live view-sharing (who may read a
session, who may write its scores, and how an Umpire PIN claim is validated).

This project does not use the Firebase CLI, so the file is not deployed
automatically. After changing it, paste its contents verbatim into the Firebase
Console under **Realtime Database > Rules** and publish. The deployed rules and
this file are expected to stay identical — if they drift, this file is the one
that was reviewed.

The feature also requires **Anonymous Authentication** to be enabled in the
Firebase Console (Authentication > Sign-in method); without it every device
lacks a `uid` and all writes are rejected.
