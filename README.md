# RunCoach AI

Personalized, AI-powered road running coach. Combines Strava integration, adaptive training planning, strength programming, and progression analytics — guided by an AI assistant with the philosophy of elite road running coaches.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS + CSS custom properties (light/dark theme)
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini 2.5 Flash
- **Strava**: OAuth2 + activity sync
- **Charts**: Recharts
- **State**: Zustand (theme persistence)
- **Deployment**: Vercel

## Architecture

```
src/
  app/                    # Next.js App Router pages + API routes
    api/
      strava/             # OAuth, sync, webhook
      coach/              # Plan generation, analysis, feedback, risk, patterns, phase
      strength/           # Program generation, workout logging
      notifications/      # Notification CRUD + generation
    training/             # Weekly plan view
    strength/             # Strength workouts + logger
    progression/          # Charts and analytics
    settings/             # Strava connect, goals, preferences
  lib/
    db.ts                 # Supabase clients (browser + service)
    strava.ts             # Strava API client + sync
    coach.ts              # AI coaching prompts + Gemini calls
    injury-risk.ts        # ACWR-based risk scoring
    phase-manager.ts      # Training phase transition logic
    pattern-detection.ts  # Adaptive learning pattern detection
    race-predictor.ts     # VDOT-based race time predictions
    strength-programs.ts  # Phase-based strength templates
    notifications.ts      # Notification generation logic
    utils.ts              # Pace/distance/time helpers
    theme.ts              # Light/dark theme store
  components/
    dashboard/            # FeedbackModal
    ui/                   # ThemeToggle, NotificationBell
  types/index.ts          # TypeScript interfaces
  prompts/                # AI coaching prompt templates
supabase/
  migrations/             # Database schema SQL
```

## Setup

### 1. Clone and install

```bash
git clone https://github.com/emattis/runcoach-ai.git
cd runcoach-ai
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migrations in `supabase/migrations/` in order via the SQL editor
3. Copy your project URL, anon key, and service role key

### 3. Strava App

1. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api)
2. Set the authorization callback domain to your app URL (e.g. `localhost` for dev, your Vercel domain for prod)
3. Copy the client ID and client secret

### 4. Gemini API

1. Get an API key from [Google AI Studio](https://aistudio.google.com/apikey)

### 5. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in all values:

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Your app URL (`http://localhost:3000` for dev) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `STRAVA_CLIENT_ID` | Strava app client ID |
| `STRAVA_CLIENT_SECRET` | Strava app client secret (server-side only) |
| `NEXT_PUBLIC_STRAVA_CLIENT_ID` | Same as STRAVA_CLIENT_ID (for client-side OAuth URL) |
| `GEMINI_API_KEY` | Google Gemini API key (server-side only) |

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push to GitHub
2. Import the repo in [vercel.com/new](https://vercel.com/new)
3. Add all environment variables from the table above
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel deployment URL (e.g. `https://runcoach-ai.vercel.app`)
5. Update your Strava app's callback domain to match
6. Deploy

## Key Features

- **AI Training Plans**: Weekly plan generation with phase-specific programming (base/build/peak/taper/recovery)
- **Strava Sync**: Automatic activity import with run data mapping
- **Post-Run Feedback**: Feel rating, energy, soreness tracking, sleep quality
- **Injury Risk Scoring**: ACWR-based 0-100 score with 6 weighted factors
- **Adaptive Intelligence**: Pattern detection learns sleep-performance correlation, mileage sweet spots, recovery needs, pacing tendencies
- **Phase Transitions**: Automatic detection when athlete is ready for the next training phase
- **Race Predictions**: VDOT-based predictions for 5K through marathon
- **Strength Training**: Phase-appropriate programs with set-by-set logging
- **Progression Analytics**: 6 Recharts visualizations including ACWR training load
- **Notifications**: Coaching reminders for feedback, injury warnings, phase transitions
- **Mobile Responsive**: Bottom nav on mobile, full desktop sidebar
- **Light/Dark Theme**: Persistent theme toggle
