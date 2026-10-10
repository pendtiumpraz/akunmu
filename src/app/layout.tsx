import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { I18nProvider } from "@/shared/i18n/client";
import { localeDefinition } from "@/shared/i18n/locales";
import { appDefaultLocale, getI18n } from "@/shared/i18n/server";
import { APP_NAME } from "@/shared/ui/logo";
import { THEME_SCRIPT } from "@/shared/ui/theme";
import { ToastProvider } from "@/shared/ui/toast";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t("landing.metaDescription"),
    applicationName: APP_NAME,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f14" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, messages } = await getI18n();
  const definition = localeDefinition(locale);
  return (
    // The theme script sets data-theme before hydration, hence suppressHydrationWarning on <html> only.
    <html lang={locale} dir={definition.dir} className={`${jakarta.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-canvas font-sans text-ink antialiased">
        <I18nProvider locale={locale} defaultLocale={appDefaultLocale()} messages={messages}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
