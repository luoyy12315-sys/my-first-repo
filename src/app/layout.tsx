import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Lumina · AI 学习工作台",
  description: "会因你而变的 AI 导师：对话、练习、可交互教材，学习证据可追溯。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#121312" },
  ],
};

const themeScript = `(function(){try{var t=localStorage.getItem('lumina-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "var(--panel)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: "12px",
              fontSize: "13.5px",
            },
          }}
        />
      </body>
    </html>
  );
}
