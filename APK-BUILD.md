# Building an APK for Token Casino VR

The game is now an installable **PWA** (web app manifest + icons + service worker),
so you can wrap it into an Android **APK** without Android Studio using **PWABuilder**.

> Works for **Android phones/tablets** and **Meta Quest** (the Quest package runs in
> the Quest Browser engine, so WebXR/VR still works).

## Easiest: PWABuilder (no tools to install)

1. Make sure the site is live over HTTPS: **https://etfhanstorz.github.io/token-inc.github.io/**
2. Go to **https://www.pwabuilder.com**.
3. Paste that URL → **Start**. It scores the PWA (manifest + service worker should pass).
4. Click **Package For Stores**.
   - **Android** tile → **Generate Package** → choose the **"Signed APK"** option
     (for sideloading) or the AAB (for the Play Store). Download the zip.
   - **Meta Quest** tile → **Generate Package** → download the APK for sideloading.
5. Unzip. You get the `.apk` plus a `signing.keystore` and a `assetlinks.json`.

### Install it
- **Phone:** copy the `.apk` to your phone and open it (allow "install from unknown
  sources"). Or `adb install app-release-signed.apk`.
- **Meta Quest:** sideload with **SideQuest** or `adb install your.apk`, then find it
  under **Apps → Unknown Sources**.

## About the address bar (Digital Asset Links)
A wrapped PWA (TWA) normally shows a thin browser address bar **unless** a file at
`https://etfhanstorz.github.io/.well-known/assetlinks.json` verifies your app's
signing fingerprint. Because this site lives under a subpath, you don't control that
root path here. Options to get a clean, bar-free app:

- **Best:** put the game on its **own domain** (or a `username.github.io` root repo)
  and host the `assetlinks.json` PWABuilder gives you at `/.well-known/assetlinks.json`.
- For **Meta Quest**, the address bar is generally not shown the same way, so the
  Quest package is usually fine as-is.
- For casual sideloading, a slim bar is cosmetic and the game is fully playable.

## Alternative: bundle it offline (Capacitor)
If you want the HTML packaged **inside** the APK (no server needed, no address bar on
phones), use Capacitor — more setup, and note WebXR VR only works in the Quest Browser,
so this route is best for the **phone** (flat-screen) build:

```bash
npm create @capacitor/app
# copy index.html, icons/, manifest.webmanifest, sw.js into the web dir
npm i @capacitor/core @capacitor/android
npx cap add android
npx cap sync
npx cap open android   # build the APK in Android Studio
```

## Regenerating icons
Icons live in `icons/`. To change them, edit and run `make_icons.py` (needs Pillow:
`pip install pillow`).
