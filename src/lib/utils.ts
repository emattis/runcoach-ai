import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert seconds-per-mile to "M:SS" pace string */
export function formatPace(secondsPerMile: number): string {
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Convert "M:SS" pace string to seconds-per-mile */
export function parsePace(pace: string): number {
  const [minutes, seconds] = pace.split(":").map(Number);
  return minutes * 60 + seconds;
}

/** Convert meters to miles */
export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

/** Convert seconds to "H:MM:SS" duration string */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
