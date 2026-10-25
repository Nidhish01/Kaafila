# Activate the Kaafila Android pilot

Firebase configuration was explicitly deferred by the owner. The current app opens a setup screen and an isolated sample walkthrough. It does not send real OTPs, create dispatches or simulate GPS. Complete these steps before using real drivers.

## 1. Owner-controlled Firebase project

1. Create a project in [Firebase Console](https://console.firebase.google.com/) under your own Google account. No project ID has been fabricated in this repository.
2. Connect a billing account and use the Blaze plan. Real verification SMS requires pay-as-you-go billing. Set budgets and alerts in your account. See [Authentication limits](https://firebase.google.com/docs/auth/limits).
3. Enable Authentication → Phone. Set the SMS region policy to allow India. Start with Firebase test numbers and fixed test OTPs; use a real approved number only for the final device test. Never disable app verification for production.
4. Create Firestore in Native mode, preferably a region close to the pilot. Create the default Cloud Storage bucket. Enable Cloud Messaging API. Retention defaults are 30 days for location batches and 90 days for delivery photos.
5. Register Android package **`in.kaafila.driver`**. Add the SHA-1 and SHA-256 signing fingerprints printed by the release build / `apksigner verify --print-certs`. Download `google-services.json` into `driver-mobile/`. It is ignored by Git. A changed signing key requires updated fingerprints.

For sideloaded APKs, Firebase may use its reCAPTCHA fallback. Verify that flow on the pilot phone. See [Android phone authentication](https://firebase.google.com/docs/auth/android/phone-auth).

## 2. Deploy the backend

Use Node 22, Java 21 for emulators, and Firebase CLI. From `firebase/functions`, run `npm ci`. From `firebase`:

```sh
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools functions:secrets:set DISPATCH_GATEWAY_SECRET
npx firebase-tools deploy --only functions,firestore,storage
```

Select your actual project. Generate a cryptographically random gateway secret of at least 32 characters and enter it interactively. Do not commit it or paste it into chat. Store the same value as a **server-only Site runtime secret** below. Functions use their managed service account; no downloadable Firebase administrator key is needed by the website or APK.

Parameters, stored in the ignored Functions environment file or supplied during deployment:

| Name | Default | Purpose |
|---|---|---|
| `DISPATCH_ORG_ID` | `kaafila` | Single pilot organisation ID; choose once before creating records |
| `LOCATION_RETENTION_DAYS` | `30` | New location batch expiry |
| `PHOTO_RETENTION_DAYS` | `90` | New photo expiry |

The scheduled cleanup deletes expired photo objects and metadata and expired location batches. Enable Firestore TTL on collection group `locations`, field `expiresAt`, as a second cleanup mechanism. Expiry is assigned when a record is created; changing a retention parameter affects new records. Daily bounded cleanup can lag during a backlog; monitor scheduled function results and storage usage.

Cloud Functions deploy to `asia-south1`. Copy the actual returned URL for the `dispatch` function. Do not expose the gateway secret in an `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` variable.

## 3. Connect the existing private manager website

Preserve the Site's private audience and platform sign-in. Configure these **server runtime** values through Sites settings/tools:

| Name | Value |
|---|---|
| `DISPATCH_API_URL` | Actual HTTPS URL of the `dispatch` Cloud Function, without `/v1` |
| `DISPATCH_GATEWAY_SECRET` | Same secret set in Firebase Secret Manager |
| `DISPATCH_MANAGER_IDS` | Comma-separated platform user IDs approved to manage dispatch |

While signed into the private Site, open `/api/dispatch/status` to obtain your own `managerId`. Enrol that exact ID; an email address is not a substitute. The server checks the trusted platform identity and the manager allowlist on every operational call. POST requests require a same-origin Origin header. Unauthenticated requests and service-bypass requests without a manager identity are rejected.

The Firebase gateway trusts the server secret and the forwarded manager ID. A stolen gateway secret grants manager authority for this pilot organisation, so limit access, rotate it if exposed, and never put it in browser code. Firestore and Storage rules deny direct client reads/writes. All operational access passes through authenticated, ownership-checked APIs.

After configuring runtime values, republish/restart the Site as required by the hosting interface. Open `/dispatch`, add a vehicle, register an approved driver phone, and create a job using real locations and contact details. Jobs cannot be created from browser-local demo approvals.

## 4. Build the configured APK

Copy `driver-mobile/.env.example` to the ignored `.env`, and set `EXPO_PUBLIC_DISPATCH_API_URL` to the actual Functions URL. Add `google-services.json` from step 1. Then:

```sh
cd driver-mobile
npm ci
npm run typecheck
npx expo prebuild --platform android
```

On Windows, install Android API 36, build-tools 36.0.0, NDK 27.1.12297006 and CMake 3.22.1. Set `ANDROID_HOME` and use Java 17 or 21. Run `scripts/build-release.ps1 -SdkPath YOUR_SDK_PATH` in PowerShell. It creates a private release key in `%USERPROFILE%\.kaafila\signing`, protects its password with Windows DPAPI, produces a release APK with an embedded JS bundle, and verifies the APK signature. **Back up the keystore and recoverable password securely** before using it for a real pilot. DPAPI XML is tied to this Windows account and is not a portable key backup.

On other systems, use `eas build --platform android --profile pilot` with your Expo account. For local Gradle builds, set `KAAFILA_KEYSTORE`, `KAAFILA_STORE_PASSWORD`, `KAAFILA_KEY_ALIAS` and `KAAFILA_KEY_PASSWORD`, then run `./gradlew assembleRelease` inside the generated Android directory. Do not commit generated native builds, signing files or credentials.

If a Windows Java process reports `Unable to establish loopback connection`, use a short real local temp directory and set `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\kaafila-temp -Djava.io.tmpdir=C:\kaafila-temp` for that build/test process. Paths with spaces can also affect native compilation; use a short checkout path.

## 5. Physical-phone launch gate

The application is **not pilot-ready** until all of these have been observed on the actual pilot phone:

- Install the signed APK with no development server. Complete real SMS OTP and any reCAPTCHA fallback with an enrolled number.
- Create a two-stop real-format job. Receive or manually refresh the assignment. Accept, start sharing, confirm pickup, photograph each handover, enter receiver names and quantities, and complete.
- Inspect manager statuses, photos and event history. Verify partial delivery remains review-required and stock never exceeds loaded quantities.
- Turn the screen off and observe continuing updates. Verify the persistent notification. Battery restrictions and force-stop can interrupt Android background work; do not promise uninterrupted tracking. Manager positions become stale after two minutes.
- Enter airplane mode, save pickup/delivery/photo events, restart the app, reconnect and verify ordered, single application of each event.
- Deny GPS/camera/notification permissions, interrupt OTP, and interrupt a photo upload. Verify recovery without fabricating confirmation.
- Cancel or reassign from the manager while the phone is offline. Confirm conflicts are shown and newer manager decisions are preserved. Loaded-stock reassignment requires physical reconciliation and a replacement job.
- Verify collection stops after completion, explicit pause and sign-out. Confirm revoked drivers cannot use cached sessions against the server.
- Review every screen in English, Hindi and Punjabi with a fluent pilot user.

Push notifications are a convenience; refresh always remains available. Drivers should use the app only when safely parked. No ERP stock ledger is modified by this release.
