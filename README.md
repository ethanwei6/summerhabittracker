# Summer Habit Tracker

A small shared website for two people to track daily habits from March 12, 2026 through August 25, 2026.

## What it does

- lets each person check off 5 daily tasks
- shows a dedicated calendar for each person
- colors each day from red to green based on how many tasks were completed
- saves shared progress through a server endpoint so both people can use the same site

## Local development

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm run dev
```

3. Open `http://localhost:3000`

Without Vercel Blob configured, the app stores data locally in `data/habits.json` for development.

## Deploying to Vercel

1. Create a new Vercel project from this repo.
2. Add a Blob store in Vercel.
3. Copy the `BLOB_READ_WRITE_TOKEN` into the project's environment variables.
4. Redeploy.

Once that token is present, the app automatically uses Vercel Blob for shared persistence.

## Customizing names or tasks

Edit [lib/config.ts](/Users/ethanwei/Documents/Codex/2026-04-29-i-want-to-create-a-simple/lib/config.ts) if you want to replace `"You"` and `"Girlfriend"` with your real names or tweak the habit list.
