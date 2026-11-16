# PassInterview
Mobile-first AI interview prep platform (PWA). Zero dependencies — Node 18+.

## Run
    ADMIN_PASSWORD=yourpass ANTHROPIC_API_KEY=sk-... node server.js
Open http://localhost:3000 (on your phone: same Wi-Fi, use your computer's IP; "Add to Home Screen" to install).
Without ANTHROPIC_API_KEY it runs in demo mode with template responses.

## Features
- Auth, per-user profile/resume
- AI mock interviews (voice in/out, per-answer feedback + scores, history)
- Live copilot: mic → question → speakable answer (visible in-app; for practice / interviews that allow assistance)
- Prep: question prediction from resume+JD, coding coach, system design coach, resume/ATS review, follow-up emails, answer bank
- Plans: Free / Starter $9 / Pro $24 / Elite $49 with monthly limits; admin = unlimited everything
- Admin: stats, MRR, user/plan/role management, usage reset, disable, edit plans live

## Going to production
- Payments: POST /api/plan returns 402 for paid plans until Stripe is wired (create Checkout Session there + webhook to set user.plan). Set ALLOW_FREE_UPGRADE=1 only for testing.
- Swap data/db.json for Postgres; put behind HTTPS; set strong ADMIN_PASSWORD.

## Deploy: GitHub Pages (frontend) + any Node host (API)
1. Push to GitHub (`main`). In repo Settings → Pages, set Source = "GitHub Actions".
2. Deploy `server.js` to a Node host (Render, Railway, Fly.io; start command `node server.js`). Set env: `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `CORS_ORIGIN=https://<user>.github.io`. Attach a persistent disk for `data/` or move to Postgres.
3. In repo Settings → Secrets and variables → Actions → Variables, add `API_BASE` = your API URL. The Pages workflow injects it into `config.js` on each push.
CI (`ci.yml`) syntax-checks and smoke-tests the API on every push/PR.
