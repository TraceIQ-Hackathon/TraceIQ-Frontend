import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraceIQ",
  description:
    "AI-powered backend analysis: load testing with clear metrics and insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
