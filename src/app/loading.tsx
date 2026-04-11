export default function Loading() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="flex items-center gap-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          className="animate-spin"
        >
          <circle
            cx="10"
            cy="10"
            r="8"
            stroke="var(--border)"
            strokeWidth="2"
          />
          <path
            d="M10 2a8 8 0 0 1 8 8"
            stroke="var(--amber)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-dim)" }}
        >
          Loading...
        </span>
      </div>
    </div>
  );
}
