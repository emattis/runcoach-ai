"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/db";

// ---- Shared input styles ----

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--bg-elevated)",
  borderColor: "var(--border)",
  color: "var(--text)",
  fontFamily: "var(--font-mono)",
};

const FOCUS_CLASS =
  "w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]";

// ---- Page ----

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const stravaParam = searchParams.get("strava");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [athleteId, setAthleteId] = useState<string | null>(null);

  // Form state
  const [marathonTarget, setMarathonTarget] = useState("2:40");
  const [halfTarget, setHalfTarget] = useState("1:15");
  const [mileageTarget, setMileageTarget] = useState(65);
  const [longRunDay, setLongRunDay] = useState("sunday");
  const [offDays, setOffDays] = useState("monday");

  const load = useCallback(async () => {
    const db = getSupabase();

    const [tokenRes, athleteRes] = await Promise.all([
      db.from("strava_tokens").select("id").limit(1).single(),
      db.from("athlete_profile").select("*").limit(1).single(),
    ]);

    setStravaConnected(!!tokenRes.data);

    if (athleteRes.data) {
      const a = athleteRes.data;
      setAthleteId(a.id);
      if (a.goals) {
        setMarathonTarget(a.goals.marathon_target ?? "2:40");
        setHalfTarget(a.goals.half_target ?? "1:15");
        setMileageTarget(a.goals.weekly_mileage_target ?? 65);
      }
      if (a.preferences) {
        setLongRunDay(a.preferences.preferred_long_run_day ?? "sunday");
        setOffDays((a.preferences.off_days ?? ["monday"]).join(", "));
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Show connected flash from OAuth redirect
  useEffect(() => {
    if (stravaParam === "connected") {
      setStravaConnected(true);
    }
  }, [stravaParam]);

  const handleSave = async () => {
    if (!athleteId) return;
    setSaving(true);
    setSaved(false);

    const db = getSupabase();
    const offDaysArray = offDays
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    await db
      .from("athlete_profile")
      .update({
        goals: {
          marathon_target: marathonTarget,
          half_target: halfTarget,
          weekly_mileage_target: mileageTarget,
        },
        preferences: {
          preferred_long_run_day: longRunDay,
          easy_pace_range: "7:30-8:15",
          off_days: offDaysArray,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", athleteId);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Settings</h1>

      {/* Strava flash message */}
      {stravaParam === "connected" && (
        <div
          className="rounded-lg px-4 py-3 mb-6 text-sm font-medium"
          style={{ background: "var(--green-soft)", color: "var(--green)" }}
        >
          Strava connected successfully.
        </div>
      )}
      {stravaParam === "error" && (
        <div
          className="rounded-lg px-4 py-3 mb-6 text-sm"
          style={{ background: "var(--red-soft)", color: "var(--red)" }}
        >
          <div className="font-medium">Failed to connect Strava.</div>
          {searchParams.get("reason") && (
            <div
              className="mt-1 text-xs"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
            >
              Reason: {searchParams.get("reason")}
            </div>
          )}
        </div>
      )}

      {/* Section 1: Strava */}
      <Section title="Strava Integration">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{
                background: stravaConnected ? "var(--green)" : "var(--text-dim)",
              }}
            />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              {stravaConnected ? "Connected" : "Not connected"}
            </span>
          </div>
          <button
            onClick={() => {
              const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
              const redirectUri = `${appUrl}/api/strava/auth`;
              const stravaUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read,activity:read_all&approval_prompt=auto`;
              console.log("[strava] Client ID:", clientId);
              console.log("[strava] Redirect URI:", redirectUri);
              console.log("[strava] Full OAuth URL:", stravaUrl);
              window.location.href = stravaUrl;
            }}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer transition-colors"
            style={{
              borderColor: "var(--border-light)",
              color: stravaConnected ? "var(--text-muted)" : "var(--amber)",
              background: "transparent",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="mr-2"
            >
              <path
                d="M6.5 11.5L9.5 5.5L12.5 11.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3.5 11.5L6.5 5.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {stravaConnected ? "Reconnect" : "Connect Strava"}
          </button>
        </div>
      </Section>

      {/* Section 2: Goals */}
      <Section title="Goals">
        <div className="space-y-4">
          <Field label="Marathon Target">
            <input
              type="text"
              value={marathonTarget}
              onChange={(e) => setMarathonTarget(e.target.value)}
              placeholder="2:40"
              className={FOCUS_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Half Marathon Target">
            <input
              type="text"
              value={halfTarget}
              onChange={(e) => setHalfTarget(e.target.value)}
              placeholder="1:15"
              className={FOCUS_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Peak Weekly Mileage">
            <input
              type="number"
              value={mileageTarget}
              onChange={(e) => setMileageTarget(Number(e.target.value))}
              min={10}
              max={150}
              className={FOCUS_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
        </div>
      </Section>

      {/* Section 3: Schedule Preferences */}
      <Section title="Schedule Preferences">
        <div className="space-y-4">
          <Field label="Preferred Long Run Day">
            <select
              value={longRunDay}
              onChange={(e) => setLongRunDay(e.target.value)}
              className={FOCUS_CLASS}
              style={{
                ...INPUT_STYLE,
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236b7084' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                paddingRight: "36px",
              }}
            >
              {[
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
                "sunday",
              ].map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Off Days" hint="Comma-separated (e.g. monday, friday)">
            <input
              type="text"
              value={offDays}
              onChange={(e) => setOffDays(e.target.value)}
              placeholder="monday"
              className={FOCUS_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
        </div>
      </Section>

      {/* Save button */}
      <div className="flex items-center gap-4 mt-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold border-0 cursor-pointer disabled:opacity-50 transition-colors"
          style={{ background: "var(--amber)", color: "#0f1117" }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {saved && (
          <span className="text-sm font-medium" style={{ color: "var(--green)" }}>
            Saved
          </span>
        )}
      </div>

      {/* Debug Section — TEMPORARY */}
      <DebugSection />
    </div>
  );
}

// ---- Debug Section (temporary) ----

function DebugSection() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/debug");
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-xl p-6 border mt-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--red)" }}
    >
      <h2
        className="text-sm font-medium uppercase tracking-wider m-0 mb-4"
        style={{ color: "var(--red)" }}
      >
        Debug — DB Connection Test
      </h2>
      <button
        onClick={handleTest}
        disabled={loading}
        className="px-4 py-2.5 rounded-lg text-sm font-semibold border-0 cursor-pointer disabled:opacity-50"
        style={{ background: "var(--red)", color: "#fff" }}
      >
        {loading ? "Testing..." : "Test DB Connection"}
      </button>
      {result && (
        <pre
          className="mt-4 p-4 rounded-lg text-xs overflow-auto"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            maxHeight: 400,
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---- Section wrapper ----

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-6 border mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2
        className="text-sm font-medium uppercase tracking-wider m-0 mb-5"
        style={{ color: "var(--text-dim)" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

// ---- Field wrapper ----

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      {hint && (
        <div className="text-xs mb-1.5" style={{ color: "var(--text-dim)" }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}
