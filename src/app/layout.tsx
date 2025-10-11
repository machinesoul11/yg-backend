import type { Metadata } from "next";
import { Playfair_Display, Montserrat, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";

// YES GODDESS Brand Fonts
const playfairDisplay = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "YES GODDESS - Backend & Admin Operations",
  description: "YES GODDESS backend services and administrative operations platform",
  keywords: ["backend", "admin", "operations", "internal"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfairDisplay.variable} ${montserrat.variable} ${jetBrainsMono.variable}`}>
      <body className="antialiased font-sans bg-brand-white text-brand-black">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
