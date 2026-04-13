import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { WorkoutType } from "@/types";

// ---- Styling ----

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---- Unit conversions ----

const METERS_PER_MILE = 1609.344;

/** Convert meters to miles */
export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

/** Convert meters-per-second to seconds-per-mile */
export function mpsToSecondsPerMile(mps: number): number {
  return METERS_PER_MILE / mps;
}

/** Convert "M:SS" pace string to total seconds */
export function parsePace(pace: string): number {
  const [minutes, seconds] = pace.split(":").map(Number);
  return minutes * 60 + seconds;
}

// ---- Formatting ----

/** Format seconds-per-mile as "M:SS" */
export function formatPace(secondsPerMile: number): string {
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Format total seconds as "H:MM:SS" or "M:SS" */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---- Date helpers ----

/** Return the Monday of the week containing `date`, as YYYY-MM-DD */
export function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ---- Workout display ----

const WORKOUT_COLORS: Record<WorkoutType, string> = {
  easy: "#22c55e",       // green
  long_run: "#3b82f6",   // blue
  tempo: "#f97316",      // orange
  intervals: "#ef4444",  // red
  recovery: "#a3e635",   // lime
  off: "#6b7280",        // gray
  cross_train: "#8b5cf6", // purple
  strides: "#eab308",    // yellow
  strength: "#f472b6",   // pink
  mobility: "#14b8a6",   // teal
  yoga: "#06b6d4",       // cyan
  drills: "#fb923c",     // light orange
};

/** Get the display hex color for a workout type */
export function workoutColor(type: WorkoutType): string {
  return WORKOUT_COLORS[type];
}

// ---- Risk assessment ----

export interface RiskLevel {
  label: "low" | "moderate" | "elevated" | "high" | "critical";
  color: string;
}

/** Map a 0-100 injury risk score to a label + color */
export function riskLevel(score: number): RiskLevel {
  if (score < 30) return { label: "low", color: "#22c55e" };
  if (score < 50) return { label: "moderate", color: "#eab308" };
  if (score < 70) return { label: "elevated", color: "#f97316" };
  if (score < 85) return { label: "high", color: "#ef4444" };
  return { label: "critical", color: "#dc2626" };
}

// ---- VDOT estimation ----

/**
 * Simplified Daniels VDOT estimate from a single race/time-trial result.
 *
 * Uses the curve-fit from "Daniels' Running Formula":
 *   VO2 = -4.60 + 0.182258·v + 0.000104·v²          (v in m/min)
 *   %VO2max = 0.8 + 0.1894393·e^(-0.012778·t)
 *             + 0.2989558·e^(-0.1932605·t)            (t in min)
 *   VDOT = VO2 / %VO2max
 *
 * Accurate within ~1 unit for distances from 1500m to marathon.
 */
export function estimateVDOT(distanceMeters: number, timeSeconds: number): number {
  const t = timeSeconds / 60; // minutes
  const v = distanceMeters / t; // meters per minute

  // Oxygen cost (ml/kg/min) at velocity v
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;

  // Fraction of VO2max sustained over duration t
  const pctVo2max =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * t) +
    0.2989558 * Math.exp(-0.1932605 * t);

  return Math.round((vo2 / pctVo2max) * 10) / 10;
}
