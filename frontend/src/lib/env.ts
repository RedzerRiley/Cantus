// Centralised access to build-time env so every key is read in one place.
// Each property access is written out literally so bundlers (Vite, or esbuild
// with --define) can statically replace it. The try/catch keeps the app
// working when a bundler leaves `import.meta.env` undefined (e.g. esbuild
// IIFE builds that only define some keys).

function readBase(): string | undefined {
  try {
    return import.meta.env.VITE_API_BASE_URL;
  } catch {
    return undefined;
  }
}

function readProd(): boolean {
  try {
    return import.meta.env.PROD === true;
  } catch {
    return false;
  }
}

const rawBase = readBase();

/** API base URL without trailing slash, e.g. "/api/v1". */
export const API_BASE_URL: string = (rawBase && rawBase.trim() ? rawBase.trim() : '/api/v1').replace(/\/+$/, '');

export const IS_PROD: boolean = readProd();
