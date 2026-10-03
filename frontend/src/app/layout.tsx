import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { TranslationProvider } from "@/context/TranslationContext";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const notoThai = Noto_Sans_Thai({ subsets: ["thai"], weight: ["400", "500", "600", "700"], variable: "--font-thai" });
const outfit = Outfit({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-heading" });

export const metadata: Metadata = {
  title: "Travel Planner",
  description: "Bilingual Mobile-First Travel Itinerary & Group Budget Planner",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121412" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${notoThai.variable} ${outfit.variable}`}>
      <body>
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
