# Visitly

AI-assisted real estate lead management and site-visit booking: buyer enquiry, grounded multilingual (English, Hindi, Gujarati) chat, real slot booking that can never double-book, and handoff to a named salesperson with a summary.

- Setup, deployment, environment variable names and demo logins: see [`deployment.md`](deployment.md)
- Stack: React + Vite + Tailwind, FastAPI, SQLAlchemy + Alembic, PostgreSQL, JWT, an LLM with tool calling
- Layout: `backend/app/{api,services,models,schemas,core}`, `backend/tests`, `frontend/src/{pages,components,lib}`
- All sample data is synthetic and labelled. WhatsApp/SMS, payments and calls are simulations, clearly badged in the UI.

Run the tests: `cd backend && python -m pytest -q` (needs local PostgreSQL) and `cd frontend && npm test`. CI runs both.
