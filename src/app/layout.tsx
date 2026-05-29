import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Cogni — Personalized Exam Prep",
  description:
    "Upload your course materials. Cogni maps them to the rubric, ranks topics by exam weight, and builds your personalised study plan.",
};

// Runs before first paint so the chosen theme applies with no flash of the
// wrong colors. Default is dark; light is opt-in and stored in localStorage.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('cogni:theme');document.documentElement.setAttribute('data-theme',(t==='light'||t==='dark')?t:'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
