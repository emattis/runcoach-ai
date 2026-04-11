"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: "low" | "medium" | "high";
  read: boolean;
  created_at: string;
}

const TYPE_ROUTES: Record<string, string> = {
  feedback_needed: "/",
  injury_warning: "/",
  phase_transition: "/",
  weekly_review: "/",
  coach_insight: "/progression",
  workout_reminder: "/training",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "var(--red)",
  medium: "var(--amber)",
  low: "var(--text-dim)",
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      // Generate new notifications + fetch unread
      await fetch("/api/notifications", { method: "POST" });
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh every 5 minutes
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unreadCount = notifications.length;
  const hasHigh = notifications.some((n) => n.priority === "high");

  const handleMarkRead = async (id: string) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClick = (n: Notification) => {
    handleMarkRead(n.id);
    setOpen(false);
    const route = TYPE_ROUTES[n.type] ?? "/";
    window.location.href = route;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg border-0 cursor-pointer transition-colors relative"
        style={{
          background: "var(--bg-elevated)",
          color: unreadCount > 0 ? "var(--text)" : "var(--text-muted)",
        }}
        aria-label={`${unreadCount} notifications`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6a4 4 0 0 1 8 0c0 4 2 5 2 5H2s2-1 2-5" />
          <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full text-[9px] font-bold flex items-center justify-center px-1"
            style={{
              background: hasHigh ? "var(--red)" : "var(--amber)",
              color: "#fff",
              animation: hasHigh ? "pulse 2s infinite" : undefined,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border shadow-lg z-50"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="px-4 py-3 border-b text-xs font-medium uppercase"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-dim)",
            }}
          >
            Notifications
            {unreadCount > 0 && (
              <span
                className="ml-2 px-1.5 py-0.5 rounded-full text-[10px]"
                style={{
                  background: "var(--amber-soft)",
                  color: "var(--amber)",
                }}
              >
                {unreadCount}
              </span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div
              className="px-4 py-6 text-center text-sm"
              style={{ color: "var(--text-dim)" }}
            >
              All caught up
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className="w-full text-left px-4 py-3 border-b last:border-0 cursor-pointer border-0 transition-colors"
                style={{
                  borderColor: "var(--border)",
                  background: "transparent",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-elevated)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div className="flex items-start gap-3">
                  {/* Priority dot */}
                  <span
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{
                      background: PRIORITY_COLORS[n.priority],
                      boxShadow:
                        n.priority === "high"
                          ? `0 0 6px ${PRIORITY_COLORS.high}`
                          : "none",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium"
                      style={{ color: "var(--text)" }}
                    >
                      {n.title}
                    </div>
                    <div
                      className="text-xs mt-0.5 leading-relaxed"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {n.message}
                    </div>
                    <div
                      className="text-[10px] mt-1"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {formatTimeAgo(n.created_at)}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Pulse animation for high priority */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
