import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TextureProvider } from "@/lib/TextureContext";
import AuthGate from "@/components/AuthGate";
import { PostHogProvider } from "@/components/PostHogProvider";
import { Toaster } from "@/components/ui/sonner";
import { NextDevToolsVisibility } from "@/lib/devToolsSetting";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Minecraft Screen Designer",
  description: "Visual designer for Minecraft mod GUI screens",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          <PostHogProvider>
            <AuthGate><TextureProvider>{children}</TextureProvider></AuthGate>
            <Toaster />
            <NextDevToolsVisibility />
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
