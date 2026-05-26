# Prem Predics Android App Release Checklist

This repository is now prepared to package the existing static Supabase website as an Android app with Capacitor.

## 1. Install local requirements

Install:

- Node.js LTS
- Android Studio
- Java/JDK version recommended by Android Studio

Then run:

```bash
npm install
```

## 2. Generate the Android project

Run this once:

```bash
npm run cap:init:android
```

This creates the `android/` native project folder.

## 3. Re-sync after web changes

Any time you change the HTML/CSS/JS app files, run:

```bash
npm run cap:sync
```

To open the Android project in Android Studio:

```bash
npm run cap:open
```

## 4. Test on an Android device/emulator

In Android Studio:

1. Open the `android/` project.
2. Run the app on an emulator or physical Android phone.
3. Test login, signup, predictions, star man picks, profile, leaderboard, and admin-only routes.

## 5. Supabase checks

The app uses the same Supabase URL and publishable key from `assets/js/supabase-client.js`.

Before release, confirm:

- Row Level Security is enabled on user-owned tables.
- Users can only read/write the data they should access.
- Email confirmation and redirect settings work as expected.
- Your production website URL remains allowed in Supabase Auth redirect settings.

For this current app setup, email/password login should work inside the app because it does not depend on OAuth browser redirects.

## 6. App identity

Current app ID:

```text
com.prempredics.app
```

Current app name:

```text
Prem Predics
```

Changing the app ID after publishing is effectively a new app, so settle this before uploading to Google Play.

## 7. Build a Play Store release

Google Play uses Android App Bundles (`.aab`).

In Android Studio:

1. Choose `Build > Generate Signed Bundle / APK`.
2. Choose `Android App Bundle`.
3. Create or select your private upload key.
4. Build the release bundle.
5. Upload the `.aab` to Google Play Console.

Keep your signing key private. Do not commit `.jks`, `.keystore`, or `key.properties` files.

## 8. Google Play Console requirements

Prepare:

- App name
- Short description
- Full description
- App icon
- Feature graphic
- Phone screenshots
- Privacy policy URL
- Data Safety form
- Account deletion instructions
- Contact email
- Internal testing release

Because this app has user accounts and predictions, make sure your privacy policy explains the account/profile/prediction data you collect and how users can request deletion.

## 9. Recommended future improvements

After the first Android release works, consider:

- Native splash screen and icon generation
- Push notifications for fixture deadlines
- App-only bottom navigation
- Better offline/loading states
- A React Native or Expo rebuild if you later want a fully native app experience
