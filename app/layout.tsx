import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/app/_components/ThemeToggle";
import { SITE_URL } from "@/lib/config";

// Type is set via CSS to the system-ui / SF Pro stack — no web font ship.
// On Apple devices system-ui resolves to the real SF Pro; elsewhere it falls
// back to the platform's native UI font (cleanest Apple.com translation).

const TITLE = "html2u — 把 AI 產出的 HTML 一鍵變連結";
const DESCRIPTION =
  "把 AI 產出的 HTML 一鍵變成可分享的連結 — 受保護、會自動過期。";

// metadataBase makes the file-convention og/twitter images (app/opengraph-image
// .png, app/twitter-image.png) and the icon resolve to ABSOLUTE URLs, which is
// what social scrapers (Facebook, LINE, X, Slack…) require to render a preview
// card. robots noindex is kept; OG scrapers ignore it and still build previews.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "html2u",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "zh_TW",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
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
