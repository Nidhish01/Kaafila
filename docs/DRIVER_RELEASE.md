# Kaafila Driver 0.1.0 — configuration-pending release

Firebase activation was deferred by the owner. No real Firebase project, verification SMS billing, operational job or location history has been created. This release must not be called pilot-ready until the physical-device launch gate in `FIREBASE_SETUP.md` passes.

## Included

- Dedicated Android app with phone OTP flow, enrolled-driver access, assignments, pickup, multi-stop delivery, photo/receiver/quantity proof, incidents, history and settings.
- English, Hindi and Punjabi text, large controls and an isolated sample walkthrough.
- SQLite cache and ordered retry queue; explicit device-saved/syncing/server-confirmed states and conflict recovery.
- Active-trip location permission and foreground service (30-second target), pause/end/sign-out stop controls, FCM and manual refresh.
- Live Dispatch manager area with vehicle/driver registration, real-format jobs, status/history, last position and accuracy, private photo access and exception resolution.
- Firebase Functions backend, deny-by-default client rules, optimistic versions, deduplication, stock conservation and retention cleanup.
- Reproducible signing script with keys outside Git; setup and API documentation.

## Verification record

- 24 domain/model/investigation tests passed, including 13 dispatch domain checks.
- 4 existing HTTP API checks passed against the local manager website.
- Website, mobile and backend TypeScript checks passed during implementation.
- Android JavaScript/Hermes bundle exported successfully.
- Browser checked: dispatch setup state, isolated sample route, stock/stop details, multi-stop form, and disabled unconfigured write actions.
- Firebase emulator suite passed all 8 end-to-end cases (9 reported tests including the parent suite): phone enrollment, expired/invalid sessions, revoked drivers, Firestore/Storage denial, cross-driver isolation, duplicate events, private proof, partial quantities, location batches, cancellation, concurrency and reassignment.
- GitHub Actions passed the [complete checks workflow](https://github.com/Nidhish01/Kaafila/actions/runs/40201958098) and the [standalone Android build](https://github.com/Nidhish01/Kaafila/actions/runs/40201895508).
- Signed APK verified with Android `apksigner` (v2 and v3) and `zipalign` (16 KB alignment). Package, SDK levels, embedded Hermes bundle and both ARM architectures inspected. The APK is not debuggable and contains no configured Firebase project or API endpoint.
- Not performed: physical Android installation, real SMS OTP, real FCM delivery, screen-off GPS, airplane-mode restart on a phone, real proof upload, and fluent-user language review.

Build-time npm audit includes an unresolved upstream `node-forge` issue in Expo's CLI/certificate tooling. The app does not enable Expo OTA updates or use those certificate-verification paths at runtime. Review upstream patches before production rollout. Firebase Functions runtime dependencies have a clean npm production audit at implementation time.

## Installable artifact

[Download Kaafila Driver 0.1.0 APK](https://github.com/Nidhish01/Kaafila/releases/download/driver-v0.1.0/Kaafila-Driver-0.1.0.apk) · [Release page](https://github.com/Nidhish01/Kaafila/releases/tag/driver-v0.1.0)

Download the APK on an Android phone, open it and follow Android's installation prompt. Choose **Explore sample trip** to try the fictional two-stop workflow. No development server is needed. Real SMS, dispatch synchronisation and GPS require Firebase setup and a rebuilt APK signed with the same key.

| Field | Value |
|---|---|
| Package / version | `in.kaafila.driver` / `0.1.0` (code `1`) |
| Android support | Android 7.0 / API 24 minimum; target API 36 |
| Architectures | `arm64-v8a`, `armeabi-v7a` |
| APK size | 35,944,441 bytes |
| APK source commit | `fdfdfa5e496193c4001721f82357f64e1a8ac754` |
| APK SHA-256 | `c580c291ccee37d36c90a1ae758e40b6aee03fd56a8cfcc7276c80a0314bf4b6` |
| Signing certificate SHA-256 | `74f8b2070e2d2da756727e90384e1fa435a4f9cffb661137031f9cee44c815bc` |
| Signing certificate SHA-1 | `f99a8e428b881d900b2efe0dbb91d80f0146e146` |

The unsigned APK was compiled on GitHub Actions and signed on the owner's Windows computer. Private signing material was never uploaded. Later source commits add the signing helper and release documentation; they do not change this APK's application code. The public certificate fingerprints above can be registered with Firebase when activation begins.

The existing private manager site now includes [Live Dispatch](https://kaafila-resilience.bhumkar899842.chatgpt.site/dispatch). Its setup state and sample preview remain separate from operational data.
