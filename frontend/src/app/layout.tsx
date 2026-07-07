import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TranslationProvider } from "@/context/TranslationContext";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Antigravity Travel Planner",
  description: "Bilingual Mobile-First Travel Itinerary & Group Budget Planner",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TranslationProvider>
          <AuthProvider>
            <div className="app-container">
              {children}
            </div>
          </AuthProvider>
        </TranslationProvider>
      </body>
    </html>
  );
}
