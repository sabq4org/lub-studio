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
      <body className="antialiased">{children}</body>
    </html>
  );
}
