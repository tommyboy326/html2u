import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/app/_components/ThemeToggle";

// Type is set via CSS to the system-ui / SF Pro stack — no web font ship.
// On Apple devices system-ui resolves to the real SF Pro; elsewhere it falls
// back to the platform's native UI font (cleanest Apple.com translation).

export const metadata: Metadata = {
  title: "html2u — 把 AI 產出的 HTML 一鍵變連結",
  description:
    "把 AI 產出的 HTML 一鍵變成可分享的連結 — 受保護、會自動過期。",
  robots: { index: false, follow: false },
};

// Inline bootstrap: read saved theme and apply BEFORE first paint.
// Runs synchronously so there's no light-to-dark flash on dark-mode users.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('html2u-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
