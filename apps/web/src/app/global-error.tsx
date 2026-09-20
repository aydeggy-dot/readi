"use client";

import { t } from "@/i18n";

/**
 * Last resort: an error in the root layout itself. This renders its own document, outside
 * everything the app normally provides, so it must not assume that globals.css, the design tokens
 * or the fonts ever loaded — that may be exactly what broke. Every value below is written out:
 * the Margin palette in both themes (ADR-0013) and the system type stack.
 */
const STYLES = `
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    background: #ffffff;
    color: #374151;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  main {
    box-sizing: border-box;
    min-height: 100dvh;
    max-width: 32rem;
    margin: 0 auto;
    padding: 2rem 1.25rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1rem;
  }
  h1 { margin: 0; font-size: 1.75rem; line-height: 1.2; font-weight: 600; }
  p { margin: 0; font-size: 1.0625rem; line-height: 1.6; color: #4b5563; }
  button {
    align-self: flex-start;
    min-height: 48px;
    padding: 0 1.5rem;
    border: 0;
    border-radius: 4px;
    background: #c2410c;
    color: #ffffff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  button:focus-visible { outline: 2px solid #c2410c; outline-offset: 2px; }
  @media (prefers-color-scheme: dark) {
    body { background: #111827; color: #e5e7eb; }
    p { color: #9ca3af; }
    button { background: #fb923c; color: #111827; }
    button:focus-visible { outline-color: #fb923c; }
  }
`;

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-NG">
      <body>
        <style>{STYLES}</style>
        <main>
          <h1>{t("errors.title")}</h1>
          <p>{t("errors.body")}</p>
          <button type="button" onClick={reset}>
            {t("common.tryAgain")}
          </button>
        </main>
      </body>
    </html>
  );
}
