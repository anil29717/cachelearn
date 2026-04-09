# Cache Learn

Internal training / learning platform (React + Node + MySQL).

## Quick start

1. **Database** — MySQL 8.x, create a database (e.g. `course_platform`).
2. **Backend** — `cd backend && cp .env.example .env`, set `DB_*`, `JWT_SECRET`, `FRONTEND_URL`, `BACKEND_URL`. Run `npm install`, `npm run seed`, `npm run dev`.
3. **Frontend** — `cd frontend && npm install && npm run dev` (default [http://localhost:4000](http://localhost:4000)).

API routes are proxied from the dev server as same-origin `/api` (see `frontend/vite.config.ts`).

### HTTPS (local)

From `backend/`: `npm run generate-cert`, then set `HTTPS_CERT_PATH` and `HTTPS_KEY_PATH` in `.env` (see `.env.example`) and run `npm run dev:https`. Point the Vite proxy at `https://localhost:8080` via `VITE_PROXY_TARGET` in `frontend/.env.development` if needed.

## Security

- **[SECURITY.md](./SECURITY.md)** — transport, cookies, reporting.
- **[SECURITY_REMEDIATION_CHECKLIST.md](./SECURITY_REMEDIATION_CHECKLIST.md)** — remediation status vs common scanners.

Do not commit `.env` or `backend/storage/` uploads.

## Contributing

Match existing code style; keep security-sensitive changes reviewed. Report vulnerabilities per **SECURITY.md** (not public issues for undisclosed bugs).
