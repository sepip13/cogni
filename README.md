# Cogni

Personalized exam prep — upload your course materials and get a ranked study plan in under 90 seconds.

Built with Next.js 16 (App Router), Prisma 7, NextAuth v5, Anthropic Claude, Vercel Blob, and Resend.

---

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in every value in `.env.local` (see comments in that file for where to get each one).

### 3. Set up the database

Provision a PostgreSQL database (Neon free tier recommended):

```bash
# Push the schema to your database
npx prisma db push
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel

### Prerequisites

| Service | What to set up |
|---------|---------------|
| [Neon](https://neon.tech) | PostgreSQL database — copy the connection string |
| [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) | Storage for uploaded course files |
| [Resend](https://resend.com) | Transactional email — verify your sending domain |
| [Google Cloud Console](https://console.cloud.google.com) | OAuth 2.0 credentials for sign-in |
| [Anthropic Console](https://console.anthropic.com) | API key for Claude |

### Step 1 — Push your code to GitHub

```bash
git add .
git commit -m "feat: initial Cogni build"
git push -u origin main
```

### Step 2 — Create a new Vercel project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Framework preset: **Next.js** (auto-detected)

### Step 3 — Set environment variables

In the Vercel project settings → Environment Variables, add:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon connection string (include `?sslmode=require`) |
| `AUTH_SECRET` | Random 32-char secret — run `npx auth secret` locally to generate |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `RESEND_API_KEY` | From Resend dashboard |
| `ANTHROPIC_API_KEY` | From Anthropic Console |
| `BLOB_READ_WRITE_TOKEN` | From Vercel Blob storage |

> **Google OAuth redirect URI**: In Google Cloud Console, add  
> `https://your-app.vercel.app/api/auth/callback/google`  
> as an authorized redirect URI.

### Step 4 — Run database migrations on first deploy

After the first successful deploy, run this once to push the schema:

```bash
DATABASE_URL="<your-neon-url>" npx prisma db push
```

Or use Neon's console to run the SQL directly.

### Step 5 — Deploy

Click **Deploy** in Vercel. The build runs:
1. `npm install` → triggers `prisma generate` (postinstall)
2. `next build` → compiles all 21 routes

### Smoke test checklist

- [ ] `/` landing page loads without errors
- [ ] `/auth/signin` shows Google + email sign-in
- [ ] Sign in with Google redirects to `/dashboard`
- [ ] `/courses/new` — upload a PDF, form submits, redirects to course page
- [ ] Course page shows "Processing…" then transitions to READY
- [ ] Topic detail page loads with subtopics and practice questions
- [ ] "Ask Cogni" chat responds (streaming)
- [ ] "Export PDF" downloads a valid PDF
- [ ] Delete a course from the dashboard — it disappears immediately

---

## Environment variable reference

See [`.env.example`](.env.example) for all variables with inline documentation.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router, TypeScript) |
| Database | PostgreSQL via Prisma 7 |
| Auth | NextAuth v5 (Google + Resend magic link) |
| AI | Anthropic Claude (claude-sonnet-4-5) |
| File storage | Vercel Blob |
| Email | Resend |
| PDF export | @react-pdf/renderer v4 |
| Styling | CSS custom properties + Tailwind 4 |
