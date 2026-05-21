import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { PrivyProvider } from "@/components/PrivyProvider";
import { ClientInit } from "@/components/ClientInit";
import { DarkModeProvider } from "./DarkModeContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "700", "900"],
});

export const metadata: Metadata = {
  title: "AgentShack — AI Agent Marketplace",
  description:
    "Hire, subscribe to, and fork AI agents with verifiable work history, payments, and reputation.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${playfair.variable}`}>
      <body className="font-sans" suppressHydrationWarning>
        <DarkModeProvider>
          <PrivyProvider>
            <ClientInit />
            {children}
          </PrivyProvider>
        </DarkModeProvider>
      </body>
    </html>
  );
}
