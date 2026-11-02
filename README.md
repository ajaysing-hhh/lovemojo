# LoveMojo

Private couple chat and daily feed MVP.

## Run immediately

Open `index.html` in a browser, or run `npm run dev`.

## Connect Supabase

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor.
3. Copy `config.example.js` to `config.js` and fill in the project URL, anon key, and couple ID.
4. Add `<script src="config.js"></script>` and `<script src="backend.js"></script>` before `script.js` in `index.html`.
5. Enable anonymous sign-in or email/password auth in Supabase Authentication.

Never put a Supabase service-role key in this app. The browser only receives the public anon key; row-level security protects couple data.

## Build an Android test APK

Install Android Studio and the Android SDK, then run:

```bash
npm install
npm run android:add
npm run android:sync
npx cap open android
```

In Android Studio, choose **Build > Build APK(s)**. The generated debug APK can be installed on a test phone.

## Publish to GitHub

Authenticate once with `gh auth login`, then:

```bash
gh repo create lovemojo --public --source=. --remote=origin --push
```
