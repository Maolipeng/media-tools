import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Media Tools",
  description: "AI-powered multimedia processing with FFmpeg, ImageMagick, and SoX."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hans">
      <body>{children}</body>
    </html>
  );
}
