# Job Tracker

A full-stack job application tracker that connects to your Gmail and automatically detects application statuses, interview invites, rejections, and more. Built for job seekers who are tired of manually tracking 50+ applications across spreadsheets.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748)
![License](https://img.shields.io/badge/License-MIT-green)

## What It Does

- **Gmail Auto-Scan** — Connects to your Gmail (multiple accounts supported), scans for job-related emails, and automatically creates touchpoints for each interaction
- **Stage Detection** — Reads email subjects and bodies to detect stages like acknowledged, interview, assignment, offer, or rejection
- **Touchpoint Timeline** — Every email interaction is logged as a touchpoint with a direct link back to the exact email in Gmail
- **Kanban + Table Views** — Switch between a drag-and-drop Kanban board and a sortable table view
- **Follow-Up Reminders** — Tracks when you last reached out and flags overdue follow-ups
- **JobSuite (Outreach)** — An advanced AI email generator that crafts hyper-personalized cold emails, startup pitches, and follow-ups by synthesizing your CV, scraping target company sites, and analyzing job descriptions.
- **Bring Your Own Keys (BYOK)** — Securely configure and manage your API keys (Gemini, Hunter, Apollo, Serper, Tavily, Exa) in the Settings page.
- **Real-Time API Tracker** — A floating widget that polls and displays real-time global account limits and session usage across all connected APIs.
- **Braintrust Evaluation Loop** — Built-in LLM testing and evaluation suite that uses heuristic scorers and LLM-as-a-judge to guarantee email quality and factuality. Read the [Comprehensive 805-Trace Evaluation Whitepaper](evaluation_methodology.md).
- **Custom Stages & Properties** — Define your own pipeline stages with colors and add custom fields.
- **Chrome Extension** — Auto-detect company names on career pages and add applications with one click.

## Screenshots

| Table View | Kanban Board |
|---|---|
| Track all applications with sortable columns, status filters, and touchpoint counts | Drag-and-drop cards across pipeline stages |

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| Language | [TypeScript](https://www.typescriptlang.org/) |
| Database | [PostgreSQL](https://www.postgresql.org/) via [Supabase](https://supabase.com/) |
| ORM | [Prisma](https://www.prisma.io/) |
| Auth | [NextAuth.js](https://next-auth.js.org/) with Google OAuth |
| Email | [Gmail API](https://developers.google.com/gmail/api) (read-only) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| State | [TanStack Query](https://tanstack.com/query) |
| Drag & Drop | [@hello-pangea/dnd](https://github.com/hello-pangea/dnd) |
| Search APIs | [Serper.dev](https://serper.dev/), [Tavily](https://tavily.com/), [Exa](https://exa.ai/) |
| Data APIs | [Hunter.io](https://hunter.io/), [Apollo.io](https://apollo.io/) |
| AI / LLMs | [Google Gemini](https://ai.google.dev/) |
| AI Testing | [Braintrust](https://www.braintrustdata.com/) |
| Hosting | [Vercel](https://vercel.com/) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Supabase](https://supabase.com/) account (free tier works)
- A [Google Cloud](https://console.cloud.google.com/) project with OAuth credentials

### 1. Clone & Install

```bash
git clone https://github.com/Kumkumlover/Job-Tracker.git
cd Job-Tracker/web
npm install
```

### 2. Set Up Supabase (Database)

1. Go to [supabase.com](https://supabase.com/) and create a new project
2. Once created, go to **Settings > Database** and copy the connection strings:
   - **URI** (with connection pooling) → `DATABASE_URL`
   - **Direct connection** → `DIRECT_URL`

### 3. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services > OAuth consent screen**
   - Set up as **External** user type
   - Add the scope: `https://www.googleapis.com/auth/gmail.readonly`
   - Add your email as a test user
   - **Publish the app** (under Audience) to avoid token expiry every 7 days
4. Go to **APIs & Services > Credentials**
   - Create an **OAuth 2.0 Client ID** (Web application)
   - Add authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (development)
     - `https://your-domain.vercel.app/api/auth/callback/google` (production)
5. Copy the **Client ID** and **Client Secret**
6. Go to **APIs & Services > Library** and enable the **Gmail API**

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Supabase PostgreSQL (from step 2)
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="run: openssl rand -base64 32"

# Google OAuth (from step 3)
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
```

Generate `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

### 5. Set Up the Database

```bash
npx prisma db push
```

### 6. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

## Usage

### Adding Applications

- Click **+ New** to manually add an application
- Or use the Chrome extension to auto-detect from career pages

### Gmail Sync

1. After signing in, click **Backfill** to scan your Gmail for the last 3 months of job-related emails
2. The system automatically:
   - Finds inbound emails (acknowledgments, rejections, interview invites)
   - Finds outbound emails you sent to company addresses
   - Extracts company names, roles, and stages
   - Creates touchpoints linked to exact Gmail messages
3. Click **Sync** for incremental updates (only new emails since last sync)

### Linking Multiple Gmail Accounts

Go to **Settings** to link additional Gmail accounts (e.g., college email). All linked accounts are scanned during sync/backfill.

### Touchpoints

Each application tracks every email interaction as a "touchpoint". Click the envelope icon on any application to see all touchpoints with:
- Email subject and sender
- Detected stage (if any)
- Direct link to open the exact email in the correct Gmail account

### Custom Stages

Go to **Settings** to customize your pipeline stages. Each stage has a name, color, and sort order. The Kanban board columns match your custom stages.

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Kumkumlover/Job-Tracker)

1. Click the button above or connect your fork to Vercel
2. Add the same environment variables from `.env` to your Vercel project settings
3. Update `NEXTAUTH_URL` to your Vercel domain
4. Add your Vercel domain to Google OAuth authorized redirect URIs

## Project Structure

```
web/
├── prisma/schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── api/                  # 20 API routes
│   │   │   ├── applications/     # CRUD for applications
│   │   │   ├── gmail/            # Sync, backfill, link accounts
│   │   │   ├── touchpoints/      # Touchpoint management
│   │   │   └── ...
│   │   ├── dashboard/            # Main dashboard page
│   │   └── settings/             # User settings
│   ├── components/
│   │   ├── dashboard/            # TableView, KanbanBoard, Filters
│   │   └── gmail/                # Sync button
│   ├── lib/
│   │   ├── gmail.ts              # Gmail API integration (core)
│   │   ├── auth.ts               # NextAuth config
│   │   └── prisma.ts             # Database client
│   └── types/                    # TypeScript types
├── .env.example                  # Environment template
└── package.json
```

## How Gmail Scanning Works

The scanner runs 4 targeted Gmail queries per account:

| Query | What It Catches |
|---|---|
| Subject keywords (application, interview, rejected...) | Inbound ACKs, rejections, interview invites |
| `from:me` + job subject keywords | Your outbound cold emails and follow-ups |
| ATS domain emails (Greenhouse, Lever, Keka...) | Automated platform emails |
| Job portal emails (LinkedIn, Naukri...) | Portal application confirmations |

Each email is then:
1. **Parsed** — extracts company name, role, and stage from subject/body
2. **Matched** — fuzzy-matched to existing applications using bidirectional company name comparison
3. **Saved** — creates a touchpoint with a direct Gmail deep link (opens correct account)

## Contributing

Contributions are welcome! Feel free to open issues or submit PRs.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/cool-feature`)
3. Commit your changes (`git commit -m 'Add cool feature'`)
4. Push to the branch (`git push origin feature/cool-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

Built by [Shikhar Gupta](https://github.com/Kumkumlover)
