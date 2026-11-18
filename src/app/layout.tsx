import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Inter, Lexend, Lora, Merriweather, Open_Sans, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteNotice } from "@/components/site-notice";
import { PwaSupport } from "@/components/pwa";
import { SiteFooter } from "@/components/site-footer";
import { ThemeSync } from "@/components/theme-sync";
import { DISPLAY_INIT_SCRIPT } from "@/lib/display";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";
import "./globals.css";

// Atkinson Hyperlegible was designed for low-vision readers and is the default body face; Source Serif for headings.
const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

// Optional body faces from the Display picker (src/components/display-settings.tsx). `preload: false` stops
// Next adding a preload link for them, and the browser only fetches a font file when some text uses that
// family, so a visitor who keeps the default never downloads these. All SIL Open Font License 1.1.
// (next/font needs literal options at each call, so they are repeated.)
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap", preload: false });
const sourceSans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin"], display: "swap", preload: false });
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"], display: "swap", preload: false });
const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"], display: "swap", preload: false });
const merriweather = Merriweather({ variable: "--font-merriweather", subsets: ["latin"], display: "swap", preload: false });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], display: "swap", preload: false });

const fontVariables = [atkinson, sourceSerif, inter, sourceSans, lexend, openSans, merriweather, lora].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: {
    default: "The Grand Strategist",
    template: "%s · The Grand Strategist",
  },
  description: "A time-boxed arena for structured reasoning. The best argument before the deadline wins.",
  applicationName: "The Grand Strategist",
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "TGS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No themeColor here: the one theme-color meta is set from the resolved theme by THEME_INIT_SCRIPT and kept in
  // sync by ThemeSync (a media-based pair would follow the device and ignore the Theme choice).
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the scripts below set data-font, data-size, data-theme and data-theme-mode on <html> before React hydrates.
    <html lang="en-GB" className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies a saved Display choice before first paint (no cookies read, so pages stay cacheable). */}
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_INIT_SCRIPT }} />
        {/* Resolves the Theme choice (Automatic, Light, Dark) to data-theme before first paint, and adds the theme-color meta. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <SiteNotice />
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
          {children}
        </main>
        <SiteFooter />
        <PwaSupport />
        <ThemeSync />
      </body>
    </html>
  );
}
