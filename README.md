# Drugs.ng WhatsApp Bot — Drugo 🤖💊

Production-ready WhatsApp Business bot for Drugs.ng that integrates messaging, OCR prescriptions, admin management, and an auto-generated OpenAPI (Swagger) UI.

Quick highlights (latest):
- Bot persona: **Drugo** — helpful assistant for Drugs.ng users.
- Auto-generated OpenAPI (Swagger) documentation available at `/api/docs`.
- Downloadable Postman collection at `/api/docs/postman` (auto-converted when possible).
- Prescription upload with OCR (Tesseract) — extracts text and attaches to orders.
- Admin system: Owner seeded from env, role-based permissions (Owner / Admin / CustomerSupport / Auditor), admin OTP reset flow, token expiry.
- Env generator: `npm run generate-env` creates `.env.example` and `render.yaml` templates for quick deployment.

---

## Contents
- [Quick Start](#quick-start)
- [Features (latest)](#features-latest)
- [Environment & Auto-Generation](#environment--auto-generation)
- [API Documentation (Swagger & Postman)](#api-documentation-swagger--postman)
- [Admin & Security Notes](#admin--security-notes)
- [Deployment (Render / Vercel / Others)](#deployment)
- [Developer Notes & Scripts](#developer-notes--scripts)

---

## Quick Start

1. Clone repo

```bash
git clone <your-repo-url>
cd drugsng-whatsapp-bot
```

2. Install dependencies (installs runtime + dev packages)

```bash
npm install
npm install --include=dev
```

3. Generate environment templates (creates `.env.example` and `render.yaml`)

```bash
npm run generate-env
```

4. Fill your environment variables in your host dashboard (Render / Vercel / Heroku) or locally copy `.env.example` → `.env` and update values.

5. Run in development

```bash
npm run dev
```

Server runs at `http://localhost:10000` by default.

---

## Features (latest)

- WhatsApp Business API integration (send & receive messages)
- User registration, login, password reset (OTP via Brevo)
- Admin panel endpoints: login, password reset (OTP), staff creation, full CRUD with role-based permissions
- Prescription upload endpoint with OCR (Tesseract) and Cloudinary storage — attached to orders and flagged for pharmacist verification
- File uploads (images, PDF) via multer in-memory + Cloudinary
- OpenAPI (Swagger) UI auto-generated and mounted at `/api/docs` (served by `swagger-ui-express` or CDN fallback)
- Postman collection export at `/api/docs/postman` (uses openapi-to-postmanv2 when available)
- Rate limiting, encryption (AES-256), and session token expiry for admin sessions

---

## Environment & Auto-Generation

- Use `npm run generate-env` to produce `.env.example` and `render.yaml` templates. These contain all required keys (WhatsApp, DB, Brevo, Cloudinary, payments, owner creds) populated with safe placeholders.
- Do NOT commit `.env` to git. Use host provider environment variable UI instead.
- To display production URL in Swagger `servers` section, set `PRODUCTION_HOST` to your domain (e.g. `drugsng-bot.onrender.com`). Swagger will include that domain in the spec.

Important keys (as placeholders in `.env.example`):
- DATABASE_URL
- WHATSAPP_ACCESS_TOKEN
- WHATSAPP_PHONE_NUMBER_ID
- WHATSAPP_VERIFY_TOKEN
- ENCRYPTION_KEY
- BREVO_API_KEY, BREVO_SENDER_EMAIL
- CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
- OWNER_EMAIL, OWNER_PASSWORD

Run:

```bash
# regenerate templates
npm run generate-env
```

---

## API Documentation (Swagger & Postman)

- Swagger UI (interactive): `GET /api/docs` — shows all documented endpoints and examples.
- Raw OpenAPI JSON: `GET /api/docs/swagger.json`.
- Download Postman collection: `GET /api/docs/postman` — if `openapi-to-postmanv2` is installed the endpoint returns a Postman v2.1 collection; otherwise it returns the OpenAPI JSON for manual conversion.

Notes:
- If `swagger-ui-express` is installed it serves docs server-side; otherwise a CDN fallback page is provided.
- Make sure `PRODUCTION_HOST` is set for accurate server URLs in the spec.

---

## Admin & Security Notes

- Owner admin seeded at first sync using `OWNER_EMAIL` and `OWNER_PASSWORD` from env. Owner can be used to sign in and create staff accounts.
- Roles: `Owner` (full), `Admin` (full), `CustomerSupport` (limited read + support actions), `Auditor` (read-only + export).
- Admin tokens: configurable expiry via `ADMIN_TOKEN_EXPIRY_MINUTES` (default 60 minutes). API uses token stored on Admin model.
- OTP: delivered via Brevo (email) — configure `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`.

Security best-practices:
- Keep `ENCRYPTION_KEY` secret and do not rotate without data migration steps.
- Use provider secret stores (Render / Vercel) to keep credentials out of repo.

---

## Deployment

Render recommended flow (render.yaml template created by `generate-env`):
- Commit `render.yaml` to repo and create a Render service from your repo. Render can pick up the `render.yaml` to preconfigure environment; otherwise paste keys from `.env.example` into the Render dashboard.
- Alternatively use Vercel: add environment variables in Project → Settings → Environment Variables.

Set `PRODUCTION_HOST` to the full domain of your deployed service to make the OpenAPI servers section show the live domain.

Tips for migration to host env:
- Use `.env.example` as checklist for all required keys.
- For Render: after adding env vars, redeploy the service.

---

## Developer Notes & Scripts

Key scripts (package.json):
- `npm run dev` — development server with nodemon
- `npm start` — production start
- `npm run setup` — environment checks
- `npm run generate-env` — create `.env.example` and `render.yaml` templates

Useful endpoints during development:
- `GET /` — root info
- `GET /health` — health check
- `GET /api/docs` — Swagger UI (interactive)
- `GET /api/docs/postman` — download Postman collection / openapi.json

---

## Changelog / Last Updated

- Latest updates: Swagger/OpenAPI docs, Postman export, `.env` generator, Render YAML template, OCR prescription pipeline, Admin role/permissions, Drugo persona.

**Last updated**: (auto) — please update this when releasing.

---

If you want, I can:
- Set `PRODUCTION_HOST` to your Render domain now so the Swagger spec shows that URL — provide the domain.
- Create a downloadable Postman collection and attach it to this PR.
- Add more endpoints and examples into the OpenAPI spec (currently Admin, Prescriptions, and Product image upload are documented).
