import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kaafila | Retail Resilience",
  description: "From disruption to decision. Investigate retail supply-chain risk, compare recovery options, and keep essentials on the shelf.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
