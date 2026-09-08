import type { Metadata } from "next";
import { Archivo, Geist_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Archivo lleva display e interfaz. El eje `wdth` no viene por defecto y es
// lo que da la jerarquía de titulares sin una segunda familia.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

// Geist Mono lleva las cifras. Una app de dinero vive de columnas que alinean.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finanzas",
  description:
    "Tus finanzas en calma. Sube el estado de cuenta de tu tarjeta y obtén un dashboard mensual con categorías automáticas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      // El script de abajo escribe data-theme antes de que React hidrate.
      suppressHydrationWarning
      className={`${archivo.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
