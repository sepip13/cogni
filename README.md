# Cogni

Personalized exam prep — upload your course materials and get a ranked study plan in under 90 seconds.

Built with Next.js 16 (App Router), Prisma 7, NextAuth v5, a self-hosted FreeLLMAPI backend, and Resend.

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

Fill in every value in `.env.local` (see comments in that file).

### 3. Set up the database

Provision a PostgreSQL database (local or Neon free tier):

```bash
npx prisma db push
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to VPS (Ubuntu 20.04+)

### Prerequisites

| Service | What to set up |
|---------|---------------|
| [Resend](https://resend.com) | Transactional email — verify your sending domain |
| FreeLLMAPI | Self-hosted LLM aggregator (see `../freellmapi`) — provides the unified API key |
| PostgreSQL | Installed on the VPS |
| Node.js 20+ | Installed on the VPS |
| Nginx | Reverse proxy |
| PM2 | Process manager (`npm install -g pm2`) |

### Step 1 — Add swap (prevents OOM during build)

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Step 2 — Create PostgreSQL database

```bash
sudo -u postgres psql
```

```sql
CREATE USER cogni_user WITH PASSWORD 'strong_password_here';
CREATE DATABASE cogni_db OWNER cogni_user;
GRANT ALL PRIVILEGES ON DATABASE cogni_db TO cogni_user;
\q
```

### Step 3 — Clone and configure

```bash
mkdir -p /var/www/cogni
cd /var/www/cogni
git clone https://github.com/YOUR_USERNAME/cogni.git .

cp .env.example .env.local
nano .env.local
```

Fill in `.env.local`:

```
DATABASE_URL=postgresql://cogni_user:strong_password_here@localhost:5432/cogni_db
AUTH_SECRET=vHy8MrbXlrm/oCJIrgTe3M31w7x1kd9rMlpFVZV13ZI=
AUTH_URL=https://cogni.futuresage.online
RESEND_API_KEY=re_xxxxxxxxxxxx
UPLOAD_DIR=/var/www/cogni/uploads
```

### Step 4 — Build and migrate

```bash
mkdir -p /var/www/cogni/uploads
npm install
npx prisma db push
npm run build
```

### Step 5 — Start with PM2

```bash
pm2 start npm --name cogni -- start -- -p 3001
pm2 save
pm2 startup
```

### Step 6 — Nginx virtual host

```bash
nano /etc/nginx/sites-available/cogni
```

```nginx
server {
    listen 80;
    server_name cogni.futuresage.online;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/cogni /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### Step 7 — SSL with Certbot

```bash
certbot --nginx -d cogni.futuresage.online
```

### Smoke test checklist

- [ ] `/` landing page loads
- [ ] `/auth/signin` shows magic link email field
- [ ] Sign in email arrives and logs you into `/dashboard`
- [ ] `/courses/new` — upload a PDF, form submits, redirects to course page
- [ ] Course page shows "Processing…" then transitions to READY
- [ ] Topic detail page loads with subtopics and practice questions
- [ ] "Ask Cogni" chat responds
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
| Auth | NextAuth v5 (Resend magic link) |
| AI | FreeLLMAPI — self-hosted LLM aggregator (Gemini, Groq, Mistral, …) |
| File storage | Local disk (`UPLOAD_DIR`) |
| Email | Resend |
| PDF export | @react-pdf/renderer v4 |
| Styling | CSS custom properties + Tailwind 4 |
