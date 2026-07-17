# Coach IQ

Turn film study into a game. Watch the play, make your read, get scored.

> **Hudl tells you who watched. Coach IQ tells you who learned.**

## What it does

- **Coach mode** — paste any public YouTube clip, scrub to the decision moment,
  drop 2–4 tap-targets on the frozen frame, mark the correct read, and write the
  "why." That's a scored rep.
- **Athlete mode** — watch each rep, it freezes at the decision, tap your read,
  lock it in, and see the result plus the coach's teaching note. Faster correct
  reads score more (100–140 pts).
- **Leaderboard** — weekly team rankings so players compete on who knows the
  playbook best. Resets every Monday so nobody starts buried.

## Status: beta prototype

- Content comes from publicly available film (YouTube). Some uploads have
  embedding disabled by their owner — swap for another clip if the frame is black.
- Data persists in the browser (`localStorage`). Next step is a real backend
  (Neon Postgres) so a coach's reps sync to their whole roster and the
  leaderboard is shared.

## Stack

Next.js (App Router) · React · YouTube IFrame API · deployed on Vercel.

## Run

```bash
npm install
npm run build
```

Deployed via Vercel — no local dev server needed.
