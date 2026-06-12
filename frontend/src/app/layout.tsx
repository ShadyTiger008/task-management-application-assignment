import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { AuthProvider } from "~/context/auth-context";
import { ThemeProvider } from "~/components/theme-provider";

export const metadata: Metadata = {
  title: "TaskFlow - Modern Task Management",
  description: "Manage your tasks effectively with real-time status and priority sorting.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`} suppressHydrationWarning>
      <body className="antialiased bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans transition-colors duration-200">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

