"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useThemeStore } from "@/lib/theme";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="1" width="7" height="7" rx="1" />
        <rect x="10" y="1" width="7" height="7" rx="1" />
        <rect x="1" y="10" width="7" height="7" rx="1" />
        <rect x="10" y="10" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Training",
    href: "/training",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 14 L5 6 L9 10 L13 3 L17 8" />
        <circle cx="17" cy="8" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "Strength",
    href: "/strength",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 9h14" />
        <rect x="4" y="5" width="2" height="8" rx="0.5" />
        <rect x="12" y="5" width="2" height="8" rx="0.5" />
        <rect x="1" y="7" width="2" height="4" rx="0.5" />
        <rect x="15" y="7" width="2" height="4" rx="0.5" />
      </svg>
    ),
  },
  {
    label: "Progression",
    href: "/progression",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1,16 6,10 10,13 17,4" />
        <polyline points="12,4 17,4 17,9" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="2.5" />
        <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.05 3.05l1.41 1.41M13.54 13.54l1.41 1.41M3.05 14.95l1.41-1.41M13.54 4.46l1.41-1.41" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const hydrate = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col border-r"
      style={{
        width: 220,
        background: "var(--bg-card)",
        borderColor: "var(--border)",
      }}
    >
      {/* Brand */}
      <div className="px-5 py-6">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M13 4c0 1.1-.4 2.1-1 2.9L8 12l4 5.1c.6.8 1 1.8 1 2.9"
              stroke="var(--amber)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="16" cy="6" r="2" fill="var(--amber)" />
          </svg>
          <span className="text-lg font-semibold tracking-tight">
            <span style={{ color: "var(--amber)" }}>Run</span>
            <span style={{ color: "var(--text)" }}>Coach</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium no-underline transition-colors mb-0.5"
              style={{
                color: isActive ? "var(--text)" : "var(--text-muted)",
                background: isActive ? "var(--bg-elevated)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  e.currentTarget.style.background = "transparent";
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div
        className="px-5 py-4 border-t flex items-center justify-between"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: "var(--text-dim)" }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "var(--teal)" }}
          />
          Base Building
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
