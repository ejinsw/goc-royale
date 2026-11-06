type WebKitDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type WebKitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function isFullscreen() {
  const doc = document as WebKitDocument;
  return !!(document.fullscreenElement || doc.webkitFullscreenElement);
}

/** Toggle browser fullscreen. Must be called directly from a user gesture. */
export async function toggleFullscreen(): Promise<boolean> {
  const doc = document as WebKitDocument;
  const root = document.documentElement as WebKitElement;

  if (isFullscreen()) {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    else return false;
    return true;
  }

  if (root.requestFullscreen) {
    try {
      await root.requestFullscreen({ navigationUI: "hide" });
    } catch (error) {
      // Some implementations support the API but not the navigation option.
      if (!(error instanceof TypeError)) throw error;
      await root.requestFullscreen();
    }
    return true;
  }
  if (root.webkitRequestFullscreen) {
    await root.webkitRequestFullscreen();
    return true;
  }
  return false;
}
