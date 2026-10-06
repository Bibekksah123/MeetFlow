import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MeetFlow — Meetings that move work forward",
    template: "%s — MeetFlow",
  },
  description: "Turn conversations into clear decisions and work you can review.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
