# Halo backend

NestJS + MongoDB. Sync for the app's local store, plus the slow AI work (meal photos and text, report pages, briefs, the Advisor) through DeepSeek. The app never waits on it.

## Local

```bash
cp .env.example .env          # MONGODB_URI, APP_KEY (same as EXPO_PUBLIC_APP_KEY), DEEPSEEK_API_KEY, OPENAI_API_KEY (voice)
docker start halo-mongo       # mongo:8 on 127.0.0.1:27017
npm install
npm run start:dev
adb reverse tcp:3000 tcp:3000 # so the phone reaches localhost:3000
```

Tests: `npm test` (unit) and `npm run test:e2e` (in-memory Mongo, a fake AI).

## Deploy (Heroku + MongoDB Atlas)

`halo-backend/` deploys on its own: `src/shared` is a committed copy of halo-shared, and the `Procfile` runs `npm run start:prod` after Heroku's `npm run build`.

1. Atlas: create a free cluster and a database user. Under Network Access allow `0.0.0.0/0` (Heroku dynos have no fixed IPs). Copy the `mongodb+srv://…` URI with a database name, e.g. `/halo`.
2. Heroku app: create it, then set the config vars `MONGODB_URI` (`mongodb+srv://…/halo`), `APP_KEY` (16 chars, same as the app), `DEEPSEEK_API_KEY` and `OPENAI_API_KEY` (voice from the overlay).
3. Deploy, either way:
   - **Dashboard (GitHub):** Settings → Config Vars: `APP_BASE=halo-backend`. Settings → Buildpacks: `https://github.com/lstoll/heroku-buildpack-monorepo` first, then `heroku/nodejs`. Deploy → GitHub → connect the repo → Deploy Branch `main` (or enable automatic deploys).
   - **CLI:** from the repo root,
     ```bash
     heroku login
     heroku git:remote -a <app-name>
     git subtree push --prefix halo-backend heroku main
     ```
4. Keep it awake while it's being reviewed: Resources → dyno type **Basic** (`heroku ps:type basic`); Eco dynos sleep after 30 minutes. The app also pings `/health` at launch, so a cold dyno wakes during the splash.
5. Check: `<app URL>/health` returns `{"ok":true,"db":true}`.

Slow calls stay under Heroku's 30 s router limit: meal photos and report pages are jobs (`202` and then polling), and the Advisor streams over SSE with a heartbeat.

The app's release build reads the URL from `halo-app/.env.production.local` (`EXPO_PUBLIC_API_URL=<app URL>`).
