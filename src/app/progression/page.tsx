"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getSupabase } from "@/lib/db";
import { getWeekStart, formatPace } from "@/lib/utils";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";

// ---- Types ----

interface ActivityRow {
  activity_date: string;
  distance_miles: number | null;
  avg_pace_per_mile: number | null;
}

interface FeedbackRow {
  activity_id: string;
  feel_rating: number;
  created_at: string;
}

interface StrengthLogRow {
  exercise_name: string;
  weight_lbs: number | null;
  reps_completed: number;
  created_at: string;
}

interface WeekData {
  weekStart: string;
  weekLabel: string;
  mileage: number;
  avgPace: number | null;
  longestRun: number;
  avgFeel: number | null;
  isDownWeek: boolean;
}

// ---- Page ----

export default function ProgressionPage() {
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [strengthLogs, setStrengthLogs] = useState<StrengthLogRow[]>([]);
  const [exercises, setExercises] = useState<string[]>([]);
  const [selectedExercise, setSelectedExercise] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const db = getSupabase();
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
    const cutoff = twelveWeeksAgo.toISOString().split("T")[0];

    const [actRes, fbRes, slRes] = await Promise.all([
      db
        .from("activities")
        .select("activity_date, distance_miles, avg_pace_per_mile")
        .gte("activity_date", cutoff)
        .eq("activity_type", "run")
        .order("activity_date", { ascending: true }),
      db
        .from("run_feedback")
        .select("activity_id, feel_rating, created_at")
        .gte("created_at", twelveWeeksAgo.toISOString())
        .order("created_at", { ascending: true }),
      db
        .from("strength_logs")
        .select("exercise_name, weight_lbs, reps_completed, created_at")
        .gte("created_at", twelveWeeksAgo.toISOString())
        .order("created_at", { ascending: true }),
    ]);

    const activities: ActivityRow[] = actRes.data ?? [];
    const feedback: FeedbackRow[] = fbRes.data ?? [];
    const sLogs: StrengthLogRow[] = slRes.data ?? [];

    // Bucket activities into weeks
    const weekMap = new Map<
      string,
      { miles: number[]; paces: number[]; feels: number[] }
    >();

    for (const a of activities) {
      const wk = getWeekStart(new Date(a.activity_date));
      if (!weekMap.has(wk))
        weekMap.set(wk, { miles: [], paces: [], feels: [] });
      const bucket = weekMap.get(wk)!;
      if (a.distance_miles) bucket.miles.push(a.distance_miles);
      if (a.avg_pace_per_mile) bucket.paces.push(a.avg_pace_per_mile);
    }

    // Map feedback to weeks by created_at date
    for (const f of feedback) {
      const wk = getWeekStart(new Date(f.created_at));
      if (!weekMap.has(wk))
        weekMap.set(wk, { miles: [], paces: [], feels: [] });
      weekMap.get(wk)!.feels.push(f.feel_rating);
    }

    // Generate all 12 week slots
    const allWeeks: WeekData[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const wk = getWeekStart(d);
      const bucket = weekMap.get(wk);
      const mileage = bucket
        ? bucket.miles.reduce((s, m) => s + m, 0)
        : 0;
      const avgPace =
        bucket && bucket.paces.length > 0
          ? bucket.paces.reduce((s, p) => s + p, 0) / bucket.paces.length
          : null;
      const longestRun = bucket
        ? Math.max(0, ...bucket.miles)
        : 0;
      const avgFeel =
        bucket && bucket.feels.length > 0
          ? bucket.feels.reduce((s, f) => s + f, 0) / bucket.feels.length
          : null;

      // Detect down weeks (significantly less than prior week)
      const prevMileage =
        allWeeks.length > 0 ? allWeeks[allWeeks.length - 1].mileage : 0;
      const isDownWeek =
        prevMileage > 0 && mileage > 0 && mileage < prevMileage * 0.85;

      allWeeks.push({
        weekStart: wk,
        weekLabel: new Date(wk + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        mileage: Math.round(mileage * 10) / 10,
        avgPace: avgPace ? Math.round(avgPace) : null,
        longestRun: Math.round(longestRun * 10) / 10,
        avgFeel: avgFeel ? Math.round(avgFeel * 10) / 10 : null,
        isDownWeek,
      });
    }

    setWeeks(allWeeks);
    setStrengthLogs(sLogs);

    // Extract unique exercise names
    const exNames = [...new Set(sLogs.map((s) => s.exercise_name))].sort();
    setExercises(exNames);
    if (exNames.length > 0) setSelectedExercise(exNames[0]);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Computed data ----

  // ACWR: last 8 weeks
  const acwrData = useMemo(() => {
    const last8 = weeks.slice(-8);
    return last8.map((w, i) => {
      const allPrior = weeks.slice(0, weeks.indexOf(w));
      const chronic4 = allPrior.slice(-4);
      const chronicAvg =
        chronic4.length > 0
          ? chronic4.reduce((s, ww) => s + ww.mileage, 0) / chronic4.length
          : w.mileage || 1;
      const ratio = chronicAvg > 0 ? w.mileage / chronicAvg : 1;
      return {
        weekLabel: w.weekLabel,
        acwr: Math.round(ratio * 100) / 100,
      };
    });
  }, [weeks]);

  // Scatter: feel vs mileage
  const scatterData = useMemo(
    () =>
      weeks
        .filter((w) => w.avgFeel !== null && w.mileage > 0)
        .map((w) => ({ mileage: w.mileage, feel: w.avgFeel })),
    [weeks]
  );

  // Strength exercise data
  const strengthData = useMemo(() => {
    if (!selectedExercise) return [];
    return strengthLogs
      .filter(
        (s) => s.exercise_name === selectedExercise && s.weight_lbs !== null
      )
      .map((s) => ({
        date: new Date(s.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        weight: s.weight_lbs,
      }));
  }, [strengthLogs, selectedExercise]);

  // ---- Insights ----

  const paceInsight = useMemo(() => {
    const withPace = weeks.filter((w) => w.avgPace !== null);
    if (withPace.length < 2) return null;
    const first = withPace[0].avgPace!;
    const last = withPace[withPace.length - 1].avgPace!;
    const diff = first - last;
    if (diff > 0)
      return `Your easy pace has improved ${Math.round(diff)} sec/mi over the last ${withPace.length} weeks`;
    return null;
  }, [weeks]);

  const mileageInsight = useMemo(() => {
    const withMiles = weeks.filter((w) => w.mileage > 0);
    if (withMiles.length < 2) return null;
    const peak = Math.max(...withMiles.map((w) => w.mileage));
    return `Peak weekly mileage: ${peak} mi`;
  }, [weeks]);

  const longestRunInsight = useMemo(() => {
    const max = Math.max(0, ...weeks.map((w) => w.longestRun));
    return max > 0 ? `Longest single run: ${max} mi` : null;
  }, [weeks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div
          className="text-sm font-medium"
          style={{ color: "var(--text-dim)" }}
        >
          Loading analytics...
        </div>
      </div>
    );
  }

  // Chart theme colors
  const axisStyle = { fontSize: 11, fill: "var(--text-dim)" };
  const tooltipStyle = {
    contentStyle: {
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      fontSize: 12,
      color: "var(--text)",
    },
    labelStyle: { color: "var(--text-muted)" },
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-8">
        Progression
      </h1>

      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
      >
        {/* 1. Weekly Mileage */}
        <ChartCard title="Weekly Mileage" insight={mileageInsight}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeks}>
              <XAxis
                dataKey="weekLabel"
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v) => [`${v} mi`, "Mileage"]}
              />
              <Bar
                dataKey="mileage"
                fill="var(--amber)"
                radius={[4, 4, 0, 0]}
                opacity={0.9}
              />
              <Line
                type="monotone"
                dataKey="mileage"
                stroke="var(--amber)"
                strokeWidth={2}
                dot={false}
                strokeOpacity={0.5}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Easy Pace Trend */}
        <ChartCard title="Easy Pace Trend" insight={paceInsight}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={weeks.filter((w) => w.avgPace !== null)}
            >
              <XAxis
                dataKey="weekLabel"
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
                width={45}
                reversed
                tickFormatter={(v: number) => formatPace(v)}
                domain={["dataMin - 10", "dataMax + 10"]}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v) => [formatPace(Number(v)) + "/mi", "Avg Pace"]}
              />
              <Line
                type="monotone"
                dataKey="avgPace"
                stroke="var(--teal)"
                strokeWidth={2.5}
                dot={{ fill: "var(--teal)", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Long Run Progression */}
        <ChartCard title="Long Run Progression" insight={longestRunInsight}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={weeks}>
              <XAxis
                dataKey="weekLabel"
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v) => [`${v} mi`, "Longest Run"]}
              />
              <Line
                type="monotone"
                dataKey="longestRun"
                stroke="var(--blue)"
                strokeWidth={2.5}
                dot={{ fill: "var(--blue)", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. Feel vs Mileage Scatter */}
        <ChartCard
          title="Feel vs Mileage"
          insight={
            scatterData.length > 3
              ? "Each dot is one week — higher feel at higher mileage = good adaptation"
              : null
          }
        >
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart>
              <XAxis
                dataKey="mileage"
                name="Mileage"
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
                label={{
                  value: "miles/wk",
                  position: "insideBottomRight",
                  offset: -5,
                  style: { fontSize: 10, fill: "var(--text-dim)" },
                }}
              />
              <YAxis
                dataKey="feel"
                name="Feel"
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
                width={30}
                domain={[1, 10]}
                label={{
                  value: "feel",
                  position: "insideTopLeft",
                  offset: -5,
                  style: { fontSize: 10, fill: "var(--text-dim)" },
                }}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v, name) => [
                  name === "Mileage" ? `${v} mi` : `${v}/10`,
                  String(name),
                ]}
              />
              <Scatter data={scatterData} fill="var(--amber)" opacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 5. ACWR */}
        <ChartCard
          title="Training Load (ACWR)"
          insight="Green zone (0.8-1.3) is the safe training range"
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={acwrData}>
              <ReferenceArea
                y1={0.8}
                y2={1.3}
                fill="var(--green)"
                fillOpacity={0.08}
              />
              <ReferenceLine
                y={1.3}
                stroke="var(--green)"
                strokeDasharray="3 3"
                strokeOpacity={0.4}
              />
              <ReferenceLine
                y={1.5}
                stroke="var(--red)"
                strokeDasharray="3 3"
                strokeOpacity={0.4}
              />
              <XAxis
                dataKey="weekLabel"
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
                width={35}
                domain={[0, "auto"]}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v) => [Number(v).toFixed(2), "ACWR"]}
              />
              <Line
                type="monotone"
                dataKey="acwr"
                stroke="var(--orange)"
                strokeWidth={2.5}
                dot={{ fill: "var(--orange)", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 6. Strength Progression */}
        <ChartCard
          title="Strength Progression"
          insight={
            strengthData.length > 0
              ? `Showing ${selectedExercise} over time`
              : "Log strength workouts to see progression"
          }
        >
          {exercises.length > 0 && (
            <div className="mb-3">
              <select
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
                className="rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:border-[var(--amber)]"
                style={{
                  background: "var(--bg-elevated)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7084' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                  paddingRight: "28px",
                }}
              >
                {exercises.map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>
            </div>
          )}
          <ResponsiveContainer width="100%" height={strengthData.length > 0 ? 190 : 220}>
            {strengthData.length > 0 ? (
              <LineChart data={strengthData}>
                <XAxis
                  dataKey="date"
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v) => [`${v} lbs`, "Weight"]}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--purple)"
                  strokeWidth={2.5}
                  dot={{ fill: "var(--purple)", r: 3 }}
                />
              </LineChart>
            ) : (
              <LineChart data={[]}>
                <XAxis tick={false} axisLine={false} />
                <YAxis tick={false} axisLine={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

// ---- Chart Card wrapper ----

function ChartCard({
  title,
  insight,
  children,
}: {
  title: string;
  insight: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wider mb-4"
        style={{ color: "var(--text-dim)" }}
      >
        {title}
      </div>
      {children}
      {insight && (
        <div
          className="text-xs mt-3 leading-relaxed"
          style={{ color: "var(--text-dim)" }}
        >
          {insight}
        </div>
      )}
    </div>
  );
}
