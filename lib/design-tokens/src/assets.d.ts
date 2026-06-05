/**
 * Module declarations for static asset imports.
 *
 * Bundlers (Vite, Webpack, Vercel OG) resolve `*.svg` and `*.png` imports
 * to URL strings; TypeScript needs ambient declarations to typecheck the
 * imports inside this package without depending on a specific bundler's
 * types.
 */

declare module '*.svg' {
  const url: string
  export default url
}

declare module '*.png' {
  const url: string
  export default url
}
