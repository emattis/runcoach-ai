import { create } from "zustand";

export type Theme = "light" | "dark";

const STORAGE_KEY = "runcoach-theme";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  hydrate: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: "light",

  setTheme: (theme: Theme) => {
    set({ theme });
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  },

  toggleTheme: () => {
    const next = get().theme === "light" ? "dark" : "light";
    get().setTheme(next);
  },

  hydrate: () => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const theme = saved === "dark" ? "dark" : "light";
    set({ theme });
    applyTheme(theme);
  },
}));

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}
