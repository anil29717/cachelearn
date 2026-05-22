# Local TLS certificates

Do **not** commit `.pem` files. They are gitignored.

Generate a self-signed pair for localhost HTTPS:

```bash
cd backend
npm run generate-cert
```

Then set in `.env` (or use `npm run dev:https`, which sets paths automatically):

- `HTTPS_CERT_PATH=./certs/localhost-cert.pem`
- `HTTPS_KEY_PATH=./certs/localhost-key.pem`

Production: use your reverse proxy or mount real certificates via env paths — not files from this folder in git.
