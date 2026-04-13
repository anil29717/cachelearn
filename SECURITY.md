# Security policy

This document describes how we handle security for **Cache Learn** (Node.js / Express API + React frontend) and how to report vulnerabilities responsibly.

## Supported versions

| Area | Supported | Notes |
|------|-----------|--------|
| **Main branch** (`main`) | Yes | Security fixes applied here first. |
| **Other branches / tags** | Best effort | Use `main` for production deployments when possible. |
| **End-of-life** | N/A | This is an internal application; align deployments with the latest `main` or your release process. |

Dependency updates: run `npm audit` in `backend/` and `frontend/` regularly and upgrade per advisory severity.

---

## Reporting a vulnerability

**Please do not** open a **public** issue or discussion for an undisclosed security problem (that can put users at risk before a fix exists).

Instead, send a private report to:

**`info@cachedigitech.com`**  
*(Replace this address with your real security or engineering contact before publishing the repo.)*

Include, where possible:

1. A short description and your **severity estimate**  
2. **Steps to reproduce** (minimal proof of concept if safe)  
3. **Affected component** (API route, dependency, version, or commit SHA)  
4. **Impact** (data exposure, auth bypass, DoS, etc.)  
5. Whether you plan to **coordinate disclosure** after a fix

If you prefer PGP, add your public key block here when you have one.

---

## What to expect after you report

| Milestone | Target |
|-----------|--------|
| **Initial acknowledgement** | Within **5 business days** of receipt |
| **Severity assessment & plan** | As soon as practical; often within **10 business days** |
| **Fix & release** | Depends on complexity; we will communicate timelines for confirmed issues |

These are **goals**, not SLAs. Critical issues (active exploitation, broad data exposure) are prioritized.

---

## Responsible disclosure

We ask that you:

1. **Give us reasonable time** to investigate and ship a fix before public disclosure (industry norm is often **90 days**; we may agree on a shorter or longer window for specific cases).  
2. **Avoid** testing against production without **written permission**.  
3. **Do not** access, modify, or destroy data that is not yours; **demonstrate impact** with the least invasive method.  
4. **Coordinate** with us before publishing details, so users can upgrade.

We do not pursue legal action against researchers who follow this policy in good faith.

---

## Operational security notes (summary)

- Run the API behind **HTTPS** in production (reverse proxy TLS termination, or `HTTPS_CERT_PATH` / `HTTPS_KEY_PATH` on Node).  
- Set **`TRUST_PROXY=1`** only when a **trusted** proxy sets `X-Forwarded-For` correctly.  
- **`FRONTEND_URL`** is required when `NODE_ENV=production` (CORS and Socket.IO).  
- Do not commit **`.env`** or **`backend/storage/`** uploads.  
- Auth uses **httpOnly** cookies; in production, cookies use **`Secure`** and **`SameSite=strict`**.  
- **Rate limits** apply to `/api`, auth, and library operations.  
- **Seeding:** set **`SEED_ADMIN_PASSWORD`** and **`SEED_EMPLOYEE_PASSWORD`** in the environment; passwords are not written to disk or logs.

For a scanner-oriented checklist, see [SECURITY_REMEDIATION_CHECKLIST.md](./SECURITY_REMEDIATION_CHECKLIST.md) if present in your tree.

---

**Last updated:** maintenance pass — replace the reporting email with your organisation’s address before wide distribution.
