# YabbAI Android — TWA Wrapper

This directory holds a [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity/) project that wraps the YabbAI PWA into a real signed Android APK.

## Why TWA?
- Same React codebase → no separate Android dev required
- Full WASM + WebGL2 access → CPU/GPU miner runs natively
- Phantom wallet deep-linking works via custom URI schemes
- App size: ~3MB (the wrapper). The web app loads from the production URL.

## Prerequisites (local machine, one-time)
- JDK 17
- Android Studio + Android SDK 34
- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap): `npm install -g @bubblewrap/cli`
- Generate a keystore once:
  ```bash
  keytool -genkey -v -keystore yabbai.keystore -alias yabbai -keyalg RSA -keysize 2048 -validity 10000
  ```

## Build the signed APK

```bash
cd /app/android

# First time only
bubblewrap init --manifest=https://yabbai-mainnet-live.preview.emergentagent.com/manifest.json \
  --directory ./build

# Generate signed release APK
cd build
bubblewrap build
```

The signed APK lands at `./build/app-release-signed.apk`.

## Install on device
```bash
adb install ./build/app-release-signed.apk
```

## Asset Links (for verified TWA without browser chrome)
Upload `./assetlinks.json` to your domain at `https://yabbai-mainnet-live.preview.emergentagent.com/.well-known/assetlinks.json`. This is what removes the URL bar from the wrapper.

## Files
- `twa-manifest.json` — passed to Bubblewrap; defines name, icons, host, theme
- `assetlinks.json` — proves your domain owns the APK signature
- `.gitignore` — excludes build/, keystore, signing cred
