"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Theme = "system" | "light" | "dark";

const ICON: Record<Theme, string> = {
  system: "🖥",
  light: "☀",
  dark: "🌙",
};
const LABEL: Record<Theme, string> = {
  system: "自動(跟系統)",
  light: "亮色",
  dark: "暗色",
};

export default function ThemeToggle() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("html2u-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* private mode etc. */
    }
  }, []);

  // Hide on the share view (full-screen iframe + safety banner own the screen)
  if (pathname?.startsWith("/s/")) return null;
  if (!mounted) return null; // avoid SSR/client hydration mismatch

  function cycle() {
    const next: Theme =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    try {
      if (next === "system") {
        localStorage.removeItem("html2u-theme");
        document.documentElement.removeAttribute("data-theme");
      } else {
        localStorage.setItem("html2u-theme", next);
        document.documentElement.setAttribute("data-theme", next);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      className="theme-toggle"
      onClick={cycle}
      aria-label={`主題:${LABEL[theme]}(點擊切換)`}
      title={`主題:${LABEL[theme]} — 點擊切換`}
      type="button"
    >
      {ICON[theme]}
    </button>
  );
}
