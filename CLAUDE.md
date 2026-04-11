# CLAUDE.md — RunCoach AI

## Project Overview

**RunCoach AI** is a personalized, AI-powered road running coach application built for a single dedicated user. It combines Strava integration, adaptive training planning, strength programming, and progression analytics — all guided by an AI assistant with the knowledge and philosophy of a world-renowned road running coach (drawing from methodologies of coaches like Jack Daniels, Pfitzinger, Canova, and Magness).

The app is NOT a generic training plan generator. It is an adaptive system that learns what works for this specific athlete over time, adjusts programming based on feedback and data, and prioritizes long-term health and injury prevention above all else.

---

## Athlete Profile

### Background
- **Running history**: Ran track & field and cross country throughout high school. Attempted walk-on at Villanova University but stopped running end of sophomore year due to a series of injuries.
- **Cross-training years**: Stayed active with basketball, lifting, and football for ~5 years after stopping running.
- **Return to endurance**: Picked up cycling in San Francisco in 2019. Ran a 5K with sister in 2020. On-and-off running in 2023 due to injury.
- **Competitive return (2024)**: Ran half marathon in 1:24, full marathon in 3:04 (NYC Marathon).
- **2025 PRs**: Half marathon 1:19, full marathon 2:47 (October).
- **Current status (April 2026)**: Coming off a minor injury from March 2026 caused by building mileage + intensity too quickly. Took two weeks off. Ready to begin base building phase.

### Injury Pattern (Critical Context)
This athlete has a recurring pattern of injury when ramping volume and intensity simultaneously. The coaching AI must:
- **Never** prescribe more than a 10% weekly mileage increase (and often less — 5-8% is preferred)
- **Separate** volume building from intensity building in early phases
- **Flag risk** when the athlete self-modifies the plan to add intensity during base building
- **Monitor** subjective feel data aggressively and auto-reduce load when warning signs appear
- Build in **down weeks** (reduced mileage) every 3rd or 4th week
- Prioritize **consistency over heroics** — 6 months of 40-50 mpw is better than 3 weeks of 60 followed by injury

### Primary Goals
1. **Sub-2:40 marathon** (next A-race target — ~7 min improvement from 2:47)
2. **Sub-1:15 half marathon** (~4 min improvement from 1:19)
3. **Increase mileage injury-free** — sustainable progression to 55-70+ mpw

### Current Fitness Baseline (as of April 2026)
- Coming off 2 weeks rest — assume significantly reduced fitness
- Base building should start at ~20-25 mpw with all easy running
- No workouts (tempo, intervals, etc.) for at least 4-6 weeks
- Goal: rebuild to 40+ mpw before reintroducing any intensity

---

## Tech Stack

### Recommended Architecture
- **Framework**: Next.js 14+ (App Router) with TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **AI Layer**: Anthropic Claude API (claude-sonnet-4-20250514) for coaching logic
- **Strava Integration**: Strava API v3 (OAuth2 for activity sync)
- **Charts/Viz**: Recharts for progression graphs
- **Deployment**: Vercel (recommended — native Next.js support)
- **State Management**: React Server Components + Zustand for client state

### Project Structure
```
runcoach-ai/
├── app/
│   ├── layout.tsx                 # Root layout with nav
│   ├── page.tsx                   # Dashboard (home)
│   ├── training/
│   │   ├── page.tsx               # Weekly training plan view
│   │   └── [date]/page.tsx        # Daily workout detail + modification
│   ├── strength/
│   │   ├── page.tsx               # Strength program overview
│   │   └── log/page.tsx           # Strength workout logger
│   ├── progression/
│   │   └── page.tsx               # Charts, trends, race predictions
│   ├── settings/
│   │   └── page.tsx               # Strava connect, goals, preferences
│   └── api/
│       ├── strava/
│       │   ├── auth/route.ts      # OAuth callback
│       │   ├── sync/route.ts      # Pull activities
│       │   └── webhook/route.ts   # Real-time activity push
│       ├── coach/
│       │   ├── plan/route.ts      # Generate/adjust training plan
│       │   ├── feedback/route.ts  # Process post-run feedback
│       │   └── analyze/route.ts   # Weekly analysis + adjustments
│       └── strength/
│           └── log/route.ts       # Log strength session
├── lib/
│   ├── strava.ts                  # Strava API client
│   ├── coach.ts                   # AI coaching logic + prompts
│   ├── db.ts                      # Supabase client
│   └── utils.ts                   # Helpers (pace calc, unit conversion)
├── components/
│   ├── dashboard/
│   ├── training/
│   ├── strength/
│   ├── progression/
│   └── ui/                        # shadcn components
├── prompts/
│   ├── system.md                  # Coach persona + methodology
│   ├── plan-generation.md         # Training plan prompt template
│   ├── weekly-review.md           # Weekly analysis prompt
│   └── injury-risk.md             # Risk assessment prompt
├── types/
│   └── index.ts                   # TypeScript types
└── supabase/
    └── migrations/                # DB schema migrations
```

---

## Database Schema (Supabase / PostgreSQL)

### Core Tables

```sql
-- Athlete profile and goals
CREATE TABLE athlete_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  goals JSONB,                      -- { marathon_target: "2:40", half_target: "1:15", weekly_mileage_target: 65 }
  injury_history JSONB,             -- Array of past injuries with dates
  preferences JSONB,                -- { preferred_long_run_day: "sunday", easy_pace_range: "7:30-8:15" }
  current_phase TEXT,               -- "base_building" | "build" | "peak" | "taper" | "recovery"
  phase_start_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Strava activities synced
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strava_id BIGINT UNIQUE,
  activity_date DATE,
  activity_type TEXT,               -- "run" | "ride" | "walk" | "strength"
  distance_miles NUMERIC,
  duration_seconds INTEGER,
  avg_pace_per_mile NUMERIC,        -- seconds per mile
  avg_hr INTEGER,
  max_hr INTEGER,
  elevation_gain_ft NUMERIC,
  perceived_effort INTEGER,         -- 1-10 (from Strava or manual)
  splits JSONB,                     -- Per-mile splits
  raw_data JSONB,                   -- Full Strava payload
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Post-run subjective feedback
CREATE TABLE run_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activities(id),
  feel_rating INTEGER CHECK (feel_rating BETWEEN 1 AND 10),
  energy_level TEXT,                -- "depleted" | "tired" | "moderate" | "strong" | "great"
  soreness_areas JSONB,             -- ["left_calf", "right_hip"]
  soreness_level INTEGER CHECK (soreness_level BETWEEN 0 AND 10),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 10),
  sleep_hours NUMERIC,
  notes TEXT,                       -- Free text
  injury_flag BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI-generated training plans
CREATE TABLE training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE,
  week_number INTEGER,              -- Within current training block
  phase TEXT,                       -- "base_building" | "build" | "peak" | "taper"
  target_mileage NUMERIC,
  planned_workouts JSONB,           -- Array of daily workout objects
  coach_notes TEXT,                 -- AI-generated rationale
  adjustments_made JSONB,           -- Log of mid-week modifications
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual planned workouts
CREATE TABLE planned_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES training_plans(id),
  workout_date DATE,
  workout_type TEXT,                -- "easy" | "long_run" | "tempo" | "intervals" | "recovery" | "off" | "cross_train"
  description TEXT,                 -- "Easy run, conversational pace"
  target_distance NUMERIC,
  target_pace_range TEXT,           -- "7:30-8:00/mi"
  target_hr_zone TEXT,              -- "Zone 2"
  warmup TEXT,
  cooldown TEXT,
  completed BOOLEAN DEFAULT false,
  actual_activity_id UUID REFERENCES activities(id),
  athlete_modification TEXT,        -- If athlete changed the workout, why
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Strength training program
CREATE TABLE strength_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_date DATE,
  workout_name TEXT,                -- "Lower Body A" | "Core + Hip Stability" | "Upper Body"
  exercises JSONB,                  -- Array of { name, sets, reps, weight, rest_seconds, notes }
  phase TEXT,                       -- Aligned with running phase
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Strength exercise logs (actual performance)
CREATE TABLE strength_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strength_workout_id UUID REFERENCES strength_workouts(id),
  exercise_name TEXT,
  set_number INTEGER,
  reps_completed INTEGER,
  weight_lbs NUMERIC,
  rpe INTEGER CHECK (rpe BETWEEN 1 AND 10),  -- Rate of perceived exertion
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Weekly summaries (AI-generated analysis)
CREATE TABLE weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE,
  total_mileage NUMERIC,
  total_runs INTEGER,
  avg_easy_pace NUMERIC,
  long_run_distance NUMERIC,
  avg_feel_rating NUMERIC,
  avg_sleep_quality NUMERIC,
  injury_risk_score NUMERIC,        -- AI-assessed 0-100
  coach_analysis TEXT,               -- AI weekly review
  plan_adherence_pct NUMERIC,        -- % of planned workouts completed as prescribed
  recommendations JSONB,             -- Next week adjustments
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Coach learning log (what the AI has learned about this athlete)
CREATE TABLE coach_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,                     -- "injury_pattern" | "optimal_volume" | "recovery_needs" | "race_readiness"
  insight TEXT,                      -- "Athlete responds poorly to back-to-back quality sessions"
  confidence NUMERIC,                -- 0-1 how confident in this insight
  evidence JSONB,                    -- References to activities/weeks that support this
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## AI Coaching System

### System Prompt Philosophy
The AI coach operates with these principles (in priority order):

1. **Injury prevention above all** — No workout is worth an injury. When in doubt, do less.
2. **Consistency is king** — 50 miles/week for 12 weeks beats 70 miles/week for 3 weeks.
3. **Polarized training** — ~80% easy, ~20% moderate-to-hard. Easy means EASY (conversational).
4. **Progressive overload** — Small, sustainable increases. Max 10% mileage increase per week, with down weeks every 3-4 weeks.
5. **Periodization** — Clear phases: base → build → peak → taper → race → recovery.
6. **Individualization** — Learn from this athlete's data. What works for Kipchoge may not work here.
7. **Holistic view** — Sleep, stress, soreness, and life context all matter. Training does not exist in a vacuum.

### Coach Persona
The AI should communicate like a knowledgeable, direct, but empathetic coach. Think a blend of:
- **Jack Daniels** — Evidence-based, systematic, VDOT-driven
- **Pete Pfitzinger** — Practical, mileage-focused, detail-oriented
- **Steve Magness** — Modern, holistic, science-forward

Tone: Direct but supportive. No fluff. Explains the "why" behind every prescription. Pushes back when the athlete wants to do too much. Celebrates consistency over flashy workouts.

### Coaching Logic Flow

```
Weekly cycle:
1. SYNC Strava data (automatic via webhook or manual pull)
2. PROMPT athlete for post-run feedback after each run
3. ANALYZE weekly data every Sunday evening:
   - Compare planned vs actual
   - Assess fatigue / recovery trends
   - Check injury risk indicators
   - Update coach_learnings table
4. GENERATE next week's plan based on:
   - Current phase and goals
   - Last 4 weeks of data
   - Coach learnings about this athlete
   - Feedback trends
5. ALLOW athlete to modify any workout with a reason
   - Coach acknowledges and adjusts surrounding days if needed
```

### Injury Risk Scoring
The AI should maintain a rolling injury risk score (0-100) based on:
- Acute-to-chronic workload ratio (ACWR) — flag if >1.3
- Subjective soreness trends (rising = concern)
- Sleep quality trends (declining = concern)
- Mileage ramp rate
- Missed/modified workouts (pattern of backing off = red flag)
- History: this athlete gets hurt when combining mileage ramps with intensity

**If injury risk > 70**: Auto-suggest reduced volume. Coach warns athlete directly.
**If injury risk > 85**: Auto-prescribe recovery week regardless of plan.

---

## Feature Modules

### 1. Dashboard
The central hub showing at a glance:
- **Current week mileage** (actual vs planned, progress bar)
- **Today's workout** (prominent, with quick-complete button)
- **Weekly feel trend** (sparkline of feel ratings)
- **Injury risk gauge** (0-100 with color coding)
- **Goals tracker** (marathon/half targets with predicted race times based on current fitness)
- **Streak counter** (consecutive weeks without missing a planned run)
- **Coach note of the day** (AI-generated contextual insight)
- **Next race countdown** (if a target race is set)

### 2. Training Plan View
- **Weekly calendar** view showing each day's workout
- Color-coded by workout type (easy = green, tempo = orange, intervals = red, long run = blue, off = gray)
- Click any day to see full workout detail:
  - Warmup / main set / cooldown
  - Target pace, distance, HR zone
  - Coach rationale ("Why this workout today")
- **Modify button**: Athlete can swap, reduce, or skip with a reason
  - Coach AI responds with adjusted plan for remaining week
- **Week-over-week comparison**: See how this week compares to last 4

### 3. Strength Training
- **Programmed by running phase**:
  - Base building: Higher volume, general strength (3x/week)
  - Build phase: Moderate volume, running-specific (2-3x/week)
  - Peak/taper: Maintenance only (1-2x/week)
- **Exercise library** with categories:
  - Hip/glute stability (clamshells, side-lying abduction, single-leg bridges)
  - Core (dead bugs, pallof press, planks, anti-rotation)
  - Posterior chain (RDLs, Nordic curls, hip thrusts)
  - Single-leg strength (Bulgarian split squats, step-ups, single-leg deadlifts)
  - Plyometrics (when appropriate phase — box jumps, bounds, A-skips)
  - Upper body (push-ups, rows — minimal but included)
- **Logging interface**: For each exercise, log sets × reps × weight × RPE
- **Progressive overload tracking**: See weight/rep progression over time per exercise

### 4. Progression & Analytics
- **Mileage over time** (weekly bar chart, with trend line)
- **Easy pace trend** (is aerobic fitness improving?)
- **Long run distance progression**
- **Race time predictions** (based on recent workout data + VDOT calculations)
- **Feel rating vs mileage** (scatter plot — are you handling the volume?)
- **Sleep quality correlation** (does sleep predict next-day performance?)
- **Injury risk history** (when were you at risk, what happened?)
- **Training load chart** (acute vs chronic, with safe zone highlighted)
- **Strength progression** (per exercise over time)

### 5. Post-Run Feedback
After each synced run, prompt the athlete:
- How did you feel? (1-10 slider)
- Energy level (depleted → great)
- Any soreness? (body map or checklist)
- Soreness level (0-10)
- Sleep last night (hours + quality 1-10)
- Free text notes
- Injury flag (yes/no — triggers coach alert)

### 6. Settings & Configuration
- Strava OAuth connect/disconnect
- Goal setting (target races, target times)
- Preferred schedule (which days for long runs, off days, etc.)
- Notification preferences
- Data export

---

## Strava Integration

### OAuth2 Flow
1. User clicks "Connect Strava" → redirect to Strava authorization
2. Strava redirects back with auth code
3. Exchange code for access + refresh tokens
4. Store tokens in Supabase (encrypted)

### Data Sync
- **Webhook**: Register for Strava webhook events (new activity created)
- **Fallback**: Manual sync button + daily cron job
- **Data pulled**: Distance, duration, pace, HR, splits, elevation, perceived effort
- **Activity filtering**: Only sync runs (ignore rides, walks unless cross-training)

### API Endpoints Used
- `GET /athlete` — Profile info
- `GET /athlete/activities` — Activity list
- `GET /activities/{id}` — Activity detail with splits
- `GET /activities/{id}/streams` — HR, pace, cadence streams

---

## Coaching AI Prompts (Templates)

### Base Building Phase Plan Generation
```
You are an elite road running coach. Generate this week's training plan.

ATHLETE CONTEXT:
- Current weekly mileage: {current_mileage} miles
- Target mileage this week: {target_mileage} miles
- Phase: Base Building (week {week_num})
- Last 4 weeks mileage: {mileage_history}
- Average feel rating last week: {avg_feel}
- Injury risk score: {risk_score}/100
- Known patterns: {coach_learnings}
- Schedule preferences: {preferences}

RULES:
- ALL runs are easy/conversational pace during base building
- One long run per week (25-30% of weekly mileage)
- Include 4-6 strides (100m accelerations) 2x/week after easy runs
- Down week every 4th week (reduce volume 20-25%)
- Never increase weekly mileage more than 10%
- If injury risk > 60, reduce planned volume by 10-15%

OUTPUT: JSON array of 7 daily workout objects with fields:
  day, workout_type, distance, pace_guidance, hr_zone, description, coach_rationale
```

---

## Design Direction

### Aesthetic
- **Dark mode primary** with a sophisticated, data-rich feel
- Think: Strava meets Bloomberg Terminal meets a premium coaching app
- Clean typography, high contrast data visualization
- Accent color: warm amber/orange (energy, effort) against dark charcoal
- Secondary accent: cool teal (recovery, easy effort)
- Monospace for pace/time data, sans-serif for everything else
- Minimal chrome — let the data breathe

### UX Principles
- **Dashboard-first**: Everything important in one scroll
- **One-tap logging**: Minimize friction for post-run feedback and strength logging
- **Coach is present**: AI insights are woven into every view, not siloed
- **Mobile-first**: This will be used on a phone post-run more than on desktop

---

## Development Phases

### Phase 1: Foundation (MVP)
- [ ] Next.js project setup with TypeScript + Tailwind + shadcn/ui
- [ ] Supabase project + database schema
- [ ] Strava OAuth integration + activity sync
- [ ] Dashboard with weekly mileage display
- [ ] Basic AI plan generation (base building phase)
- [ ] Daily workout view

### Phase 2: Feedback Loop
- [ ] Post-run feedback form
- [ ] Injury risk scoring
- [ ] Weekly AI analysis
- [ ] Workout modification flow
- [ ] Coach learnings system

### Phase 3: Strength & Analytics
- [ ] Strength training module
- [ ] Strength logging interface
- [ ] Progression charts (mileage, pace, strength)
- [ ] Race prediction calculator

### Phase 4: Intelligence
- [ ] Coach learnings accumulate and influence plans
- [ ] Pattern detection (sleep → performance, mileage → injury)
- [ ] Adaptive pacing recommendations based on fitness trends
- [ ] Phase transitions (base → build → peak → taper) with auto-detection

### Phase 5: Polish
- [ ] Mobile optimization
- [ ] Push notifications (workout reminders, coach insights)
- [ ] Data export
- [ ] Deployment to Vercel

---

## Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=
```

---

## Key Technical Decisions
- **Why Next.js**: Server-side rendering for fast dashboard loads, API routes for Strava/AI backend, excellent Vercel deployment story.
- **Why Supabase**: Free tier generous enough for single-user app, built-in auth, real-time subscriptions for live updates, PostgreSQL for complex queries on training data.
- **Why Claude over GPT**: Better at nuanced, context-heavy reasoning. The coaching prompts require understanding injury patterns, periodization tradeoffs, and individualized adaptation — Claude excels here.
- **Why not a pre-built training app**: No existing app combines adaptive AI coaching, Strava sync, strength programming, AND learns from individual athlete data over time. This is bespoke.
