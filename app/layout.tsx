import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "لُب | غرفة صناعة المحتوى",
  description: "مساحة عمل لُب للقصص والمصادر والإنتاج والمراجعة.",
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
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Brand fonts from the «لُب» design system; the CSS stacks fall back to system Arabic fonts if they fail to load. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
