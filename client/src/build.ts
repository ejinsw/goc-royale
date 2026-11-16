declare const __BUILD__: string | undefined;

/** Short commit id of this build, set by Vite; "local" outside a deploy. */
export const BUILD = typeof __BUILD__ === "string" ? __BUILD__ : "local";
