# Android packaging

The Android application ID is `com.granitemeasure.ai`. The packaged web assets are generated from the existing Next.js application; no second frontend is used.

Set the backend address in `frontend/.env.local` before a mobile build. Use either a host URL or a URL ending in `/api/v1`; the API client normalizes both forms:

```text
NEXT_PUBLIC_API_URL=http://192.168.1.35:8000
```

For a local HTTP backend during debug development, set `CAPACITOR_DEV_HTTP=true` while running `npm run build:mobile`. The Android debug manifest permits cleartext traffic only for debug builds. Use an HTTPS backend and leave this unset for production builds.

```powershell
npm run build:mobile
npx cap sync android
cd android
gradlew.bat assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.