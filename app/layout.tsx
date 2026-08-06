import type { Metadata } from "next";
import { Host_Grotesk } from "next/font/google";
import "./globals.css";

const host = Host_Grotesk({
  variable: "--font-host",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OnePick",
  description: "One queue, one device. Picking for FreshMart, built on Nash.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${host.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#01051E] font-[family-name:var(--font-host)] text-white">
        {/*
          Designed for a handheld, not shrunk from a desktop layout. The frame
          is capped at 420px and centred so the demo shows the real thing at
          the real width rather than a stretched version of it.
        */}
        <div className="mx-auto min-h-dvh w-full max-w-[420px] bg-[#01051E]">
          {children}
        </div>
      </body>
    </html>
  );
}
