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
- GitHub Actions also passed the complete checks workflow for the initial driver implementation.
- Signed APK build: final artifact details recorded below when complete.
- Not performed: physical Android installation, real SMS OTP, real FCM delivery, screen-off GPS, airplane-mode restart on a phone, real proof upload, and fluent-user language review.

Build-time npm audit includes an unresolved upstream `node-forge` issue in Expo's CLI/certificate tooling. The app does not enable Expo OTA updates or use those certificate-verification paths at runtime. Review upstream patches before production rollout. Firebase Functions runtime dependencies have a clean npm production audit at implementation time.
