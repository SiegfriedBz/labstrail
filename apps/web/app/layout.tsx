import type { Metadata } from "next";
import { Martian_Mono, Sora } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { HeaderNav } from "../components/site/header-nav.tsx";
import { Logo } from "../components/site/logo.tsx";
import { SiteFooter } from "../components/site/site-footer.tsx";
import { ThemeToggle } from "../components/site/theme-toggle.tsx";
import { WalletProvider } from "../components/wallet/providers.tsx";
import { WalletButton } from "../components/wallet/wallet-button.tsx";
import { ratingChainConfig } from "../lib/rating/chain.ts";
import { siteMetadata } from "../lib/seo/site-metadata.ts";
import { SITE } from "../lib/site.ts";
import { THEME_SCRIPT } from "../lib/theme.ts";
import { WALLET_SESSION_SCRIPT } from "../lib/wallet/session.ts";
import { createWebEnv } from "../lib/web-env.ts";
import "./globals.css";

const sans = Sora({ subsets: ["latin"], variable: "--font-sora" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-martian" });

/** The site's metadata, from this deployment's settings: its address, and whether crawlers may index it. */
export function generateMetadata(): Metadata {
  return siteMetadata(createWebEnv());
}

/**
 * The shell: header with the theme and wallet buttons, then the page. Rendered per request,
 * so the Reown project id is read from the server's settings, never inlined at build time.
 * The theme, and whether a stored wallet session is coming back, are set in `<head>` before
 * the first paint (`THEME_SCRIPT`, `WALLET_SESSION_SCRIPT`).
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  const env = createWebEnv();
  const { REOWN_PROJECT_ID } = env;
  const rating = ratingChainConfig(env);
  return (
    // THEME_SCRIPT sets data-theme before the first paint, so React finds another value there.
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} overflow-x-clip`}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant, which must run before the first paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant, which must run before the first paint */}
        <script dangerouslySetInnerHTML={{ __html: WALLET_SESSION_SCRIPT }} />
      </head>
      <body className="relative min-h-svh overflow-x-clip font-sans antialiased">
        <div aria-hidden className="bench pointer-events-none absolute inset-x-0 top-0 h-[900px]" />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-30 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink"
        >
          Skip to content
        </a>
        <WalletProvider projectId={REOWN_PROJECT_ID} localRpcUrl={rating?.rpcUrl}>
          <header className="sticky top-0 z-20 border-b border-line bg-page/70 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
              <Link href="/" aria-label={`${SITE.name} home`}>
                <Logo />
              </Link>
              <nav className="flex items-center gap-2.5 sm:gap-5">
                <HeaderNav />
                <ThemeToggle />
                <WalletButton />
              </nav>
            </div>
          </header>
          <main id="main" className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
            {children}
          </main>
          <SiteFooter
            ratingController={rating && { address: rating.contract, local: rating.local }}
          />
        </WalletProvider>
      </body>
    </html>
  );
}
