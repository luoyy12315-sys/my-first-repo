"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "light";
    setTheme(current);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("lumina-theme", next);
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 rounded-full px-3 py-2 text-[13px] text-ink2 transition-colors hover:bg-panel2 hover:text-ink"
      aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
      title={theme === "dark" ? "切换到浅色" : "切换到深色"}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {!compact && <span>{theme === "dark" ? "浅色" : "深色"}</span>}
    </button>
  );
}
