import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Summer Habit Tracker",
  description: "A shared daily habit tracker for summer 2026."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
