# Visitly: deployment guide

Repository: **<PASTE GITHUB URL>**  ·  Live app: **<PASTE LIVE URL, if deployed>**

Visitly is a React (Vite) frontend, a FastAPI backend and PostgreSQL. All data in the demo is synthetic.

## 1. Run locally

Prerequisites: Python 3.11+, Node 20+, and PostgreSQL 14+ (Docker Compose file included, or a native install: create user and databases `visitly`, `visitly`, `visitly_test`). On Windows use Git Bash and `source .venv/Scripts/activate`.

```bash
git clone <repo-url> visitly && cd visitly

# 1. Database (creates `visitly` and `visitly_test` databases)
docker compose up -d db

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env                                   # then edit values if needed
alembic upgrade head                                      # create tables
python seed.py --reset                                    # demo users, projects, slots, sample leads
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                                               # http://localhost:5173 (proxies /api to :8000)
```

Open http://localhost:5173 for the buyer experience and http://localhost:5173/staff for the sales team.

**Tests** (need the Postgres from step 1, because the concurrency tests use real row locks):

```bash
cd backend && source .venv/bin/activate && python -m pytest -q
```

**Frontend tests and checks:** `cd frontend && npm test` (Vitest), `npm run lint`, `npm run build`. CI (`.github/workflows/ci.yml`) runs backend pytest against a Postgres service plus `alembic check`, and the frontend lint, tests and build on every push.

**AI chat without an API key:** leave `AI_API_KEY` empty. The assistant then degrades safely: every buyer message is answered with a localized "passed to our sales team" message and a handoff to a named executive. "Talk to a person" and the visit picker work without any key. Set `AI_API_KEY` (and optionally `AI_MODEL`) to enable the grounded multilingual assistant.

**Checking the AI with a real key:** `AI_API_KEY=... AI_MODEL=... python evals/run_evals.py` runs 21 scripted buyer scenarios (grounded answers, missing facts, Hindi/Gujarati, booking, human requests, unsure and wrong inputs) against the live model and prints pass/fail per case; `--only id1,id2` runs a subset and `--stub` shows the harness without a model (it is expected to fail cases). This has not been run against a real model by the author, so run it once after setting your key.

**Reminders worker:** reminders are sent by an in-process loop. To run them as a separate process instead (recommended in production), set `DISABLE_WORKER=1` on the API and run `python -m app.worker`. Sends are simulated.

## 2. How it is deployed

| Part | Platform | Notes |
|---|---|---|
| Frontend | Vercel, project root `frontend/` | Build `npm run build`, output `dist`. `vercel.json` rewrites all routes to `index.html`. |
| API | Render web service, root `backend/` | `render.yaml` is a Blueprint. Start command runs `alembic upgrade head`, `python seed.py` (skips if already seeded) and uvicorn. Health check `/api/health`. |
| Database | Render managed PostgreSQL | `DATABASE_URL` is injected. `postgres://` URLs are converted to the psycopg driver automatically. |
| AI | External LLM API | Key provided as an environment variable only. |

Steps: create the Render Blueprint from this repo, set the variables below, copy the API URL; create the Vercel project with `VITE_API_BASE_URL` set to that URL; then set `FRONTEND_URL` on Render to the Vercel URL (CORS allows only that origin) and redeploy the API.

Free-tier note: Render free services sleep after inactivity, so the first request can take ~30-50 seconds. Open the API `/api/health` once before a demo.

## 3. Environment variables (names only)

Backend:

| Name | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | Separate database used by the test suite (local only) |
| `JWT_SECRET_KEY` | Signing key. Must be 32+ random characters when `ENVIRONMENT=production` (the app refuses to start otherwise) |
| `JWT_EXPIRE_MINUTES` | Staff session length |
| `ENVIRONMENT` | `development` or `production` |
| `FRONTEND_URL` | Allowed CORS origin |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | LLM provider settings (key optional, see above) |
| `SEED_DEMO_PASSWORD` | Password given to demo accounts by `seed.py` (optional) |
| `SENTRY_DSN` | Optional error monitoring. Empty means off |
| `DISABLE_WORKER` | Set to `1` to stop the in-process reminder loop (used in tests/scripts) |

Frontend: `VITE_API_BASE_URL` (the API origin; empty in local dev because Vite proxies `/api`).

No values are stored in the repository. `.env` files are git-ignored; only `.env.example` is committed.

## 4. Demo logins

Password for all demo staff accounts: the value of `SEED_DEMO_PASSWORD`, which defaults to **`Visitly@Demo1`** when unset. These accounts only exist in the seeded demo data.

| Role | Email | Can do |
|---|---|---|
| Sales head (admin) | `admin@visitly.demo` | Everything: all leads, assign, fact sheets, slots, allot units, fast-forward reminders |
| Sales executive | `priya@visitly.demo` | Own and unassigned leads, notes, status, calls, tasks, payments, merge |
| Sales executive | `rahul@visitly.demo`, `neha@visitly.demo` | Same, to see per-executive isolation |

Buyers need no account: open `/`, fill the enquiry form and a chat session is created for that one lead.

## 5. What staff can do beyond the basics

- **Inbox**: conversations waiting for a human, oldest first. Open one and reply; the buyer sees it within ~8 seconds and the assistant stays silent until you press *Hand back to assistant*. Replies count as the first human response in the response-time metric.
- **Visit slots**: generate a week of slots in one go (past, duplicate and overlapping times are skipped), week calendar or list view.
- **Leads**: filters, CSV export (formula-injection safe), side-by-side duplicate compare before merging.
- **Dashboard**: date presets and comparison with the previous period.
- **Audit log** (admin): who changed facts, slots, assignments, merges, unit allotments.
- **Interface**: dark mode toggle, undo toasts, keyboard shortcuts (`?` lists them), login throttling (5 failures per account / 20 per IP per 15 minutes; per process, in memory).

## 6. Suggested 5-minute review path

1. `/` → submit an enquiry (try `+91 98250 00001`, which duplicates a seeded lead) → chat → **Pick a visit time** → confirm. The site-visit pass appears and a named salesperson is assigned.
2. Open a second private window, try booking the same slot as another buyer: the picker refreshes and asks for another time.
3. `/staff` as admin → **Leads**: duplicate warning, masked phones. Open **Meera (Demo)** for a worked Gujarati conversation, handoff summary and booking.
4. **Dashboard**: metrics are computed from the seeded rows (labelled as sample data).
5. **Messages** → *Fast-forward 25 hours* to see the 24-hour reminder logged as simulated; opt a buyer out (chat footer) and repeat to see it blocked.
6. **Project facts** and **Visit slots** to edit what the assistant knows and what buyers can book.
7. In the buyer chat press **Talk to a person**, then in `/staff` → **Inbox** reply as the executive and watch it appear in the buyer window.
