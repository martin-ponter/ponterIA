import { getBX24, isInstallMode } from "./bootstrap";

export function tryFinishInstall(bx24Instance = getBX24()) {
  return new Promise((resolve) => {
    if (!bx24Instance || !isInstallMode()) {
      resolve({ attempted: false, success: false });
      return;
    }

    if (typeof bx24Instance.installFinish !== "function") {
      resolve({ attempted: true, success: false });
      return;
    }

    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const currentWindow = typeof window === "undefined" ? undefined : window;
    const timeoutId = currentWindow?.setTimeout(() => {
      finish({ attempted: true, success: false });
    }, 2000);

    try {
      bx24Instance.installFinish(() => {
        if (timeoutId) {
          currentWindow.clearTimeout(timeoutId);
        }
        finish({ attempted: true, success: true });
      });
    } catch (error) {
      if (timeoutId) {
        currentWindow.clearTimeout(timeoutId);
      }
      console.warn("No se pudo completar installFinish:", error);
      finish({ attempted: true, success: false });
    }
  });
}
