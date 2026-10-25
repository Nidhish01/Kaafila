# Kaafila Driver

React Native / Expo Android app with English, Hindi and Punjabi interfaces. Production features use native Firebase phone authentication, a versioned dispatch API, SQLite outbox, private delivery photos, foreground-service GPS and FCM. Expo Go cannot run its native Firebase modules.

[Download the signed Android APK](https://github.com/Nidhish01/Kaafila/releases/download/driver-v0.1.0/Kaafila-Driver-0.1.0.apk). This version has Firebase setup pending and includes the sample walkthrough. Install it directly on an Android 7.0+ ARM phone; a development server is not required. Physical-phone validation remains pending.

Open **Explore sample trip** to inspect the full assignment → accept → pickup → two deliveries → completion workflow. Sample interactions do not call Firebase, use GPS, open phone numbers, or send photos. Restarting the sample resets it.

For a shortage example, load 60 milk cartons and 20 bread crates. At the first stop record 30 milk cartons instead of 40, add a damage reason, receiver and sample photo. Deliver the second stop's 20 cartons and 8 crates. Completion enters manager review and preserves the discrepancy.

```sh
npm ci
npm run typecheck
npx expo export --platform android
```

See [Firebase activation and APK signing](../docs/FIREBASE_SETUP.md), [API/offline semantics](../docs/DISPATCH_API.md) and [release status](../docs/DRIVER_RELEASE.md). The native app's source imports the shared pure domain rules in `../shared/`; the manager demo's synthetic inventory is never imported.

Generated `android/`, signing keys, Firebase configuration and local environment files are intentionally ignored. `app.config.js` and the signing config plugin recreate native configuration. The release APK includes the JS bundle and runs independently of Metro. Configuration is compiled into the app: after adding Firebase, rebuild and install the updated APK using the same release key.
