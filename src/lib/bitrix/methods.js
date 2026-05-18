export function callBitrixMethod(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.BX24) {
      reject(new Error("BX24 no disponible"));
      return;
    }

    window.BX24.callMethod(method, params, function (result) {
      if (result.error()) {
        reject(result.error());
        return;
      }

      resolve(result.data());
    });
  });
}