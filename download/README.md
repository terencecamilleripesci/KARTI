# KARTI for Android

**Most people should not download this file.** Open
<https://terencecamilleripesci.github.io/KARTI/> on the phone instead and tap
**Install** on the strip at the bottom — that is fewer taps, it does not ask
anyone to allow installs from unknown sources, and it updates itself.

This `.apk` is here for anyone who wants the app as a file: the same game
wrapped as a Trusted Web Activity, so it runs full screen with its own icon.

- `karti.apk` — package `mt.karti.app`, versionCode 224
- signed with the KARTI release key (SHA-256
  `80:97:78:E5:3E:B5:69:83:3B:83:82:6B:7C:A4:7D:17:CA:11:E9:EF:39:FB:F5:DA:63:34:49:D7:C6:CE:68:E8`)

Android will warn that it came from outside the Play Store. That warning is
correct and unavoidable for a file installed this way.

## It updates itself

The APK is a window onto the live site, so **the game inside updates on its
own**. Nobody needs a new APK when a build ships. It only needs rebuilding if
the icon, the app name or the package id changes — and it must be signed with
the same keystore every time, or installed phones will refuse the update.

## iPhone

There is no APK for iPhone and there cannot be one. Open the link in **Safari**
(only Safari can do this on iOS), then Share → **Add to Home Screen**.
