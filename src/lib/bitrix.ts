export type BitrixUser = {
    ID?: string;
    NAME?: string;
    LAST_NAME?: string;
    LOGIN?: string;
    EMAIL?: string;
    PERSONAL_PHOTO?: string;
};

export type BitrixAuth = {
    access_token: string;
    client_endpoint?: string;
    domain?: string;
    expires_in?: number;
    member_id?: string;
    refresh_token?: string;
};

export type BitrixAccessResult =
    | { allowed: true; mode: "bitrix" | "direct-dev" }
    | { allowed: false; reason: string };

type BitrixMethodResult<T> = {
    data: () => T;
    error?: () => unknown;
    error_description?: () => string;
};

type BitrixSdk = {
    init: (callback?: () => void) => void;
    installFinish: () => void;
    getAuth: () => BitrixAuth;
    callMethod: <T>(
        method: string,
        params: Record<string, unknown>,
        callback: (result: BitrixMethodResult<T>) => void,
    ) => void;
};

declare global {
    interface Window {
        BX24?: BitrixSdk;
    }
}

const BITRIX_SDK_URL = "https://api.bitrix24.com/api/v1/";
const BITRIX_URL_PARAMS = [
    "DOMAIN",
    "PROTOCOL",
    "LANG",
    "APP_SID",
    "PLACEMENT",
    "PLACEMENT_OPTIONS",
    "AUTH_ID",
    "REFRESH_ID",
    "member_id",
];

let sdkLoadPromise: Promise<BitrixSdk> | null = null;
let initPromise: Promise<BitrixSdk> | null = null;

export function isDirectAccessAllowed() {
    return import.meta.env.PUBLIC_ALLOW_DIRECT_ACCESS === "true";
}

export function isInsideIframe() {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

export function hasBitrixUrlParams(url = window.location.href) {
    const params = new URL(url).searchParams;
    const normalizedKeys = new Set(
        Array.from(params.keys()).map((key) => key.toUpperCase()),
    );

    return BITRIX_URL_PARAMS.some((key) =>
        normalizedKeys.has(key.toUpperCase()),
    );
}

export async function validateBitrixAppAccess(): Promise<BitrixAccessResult> {
    // Frontend-only UX gate. Strong validation of Bitrix requests requires a backend.
    if (
        isDirectAccessAllowed() &&
        (!isInsideIframe() || !hasBitrixUrlParams())
    ) {
        return { allowed: true, mode: "direct-dev" };
    }

    if (!isInsideIframe()) {
        return {
            allowed: false,
            reason: "Esta aplicacion solo puede abrirse desde Bitrix24.",
        };
    }

    if (!hasBitrixUrlParams()) {
        return {
            allowed: false,
            reason: "No se han detectado parametros de Bitrix24 en la apertura.",
        };
    }

    try {
        await initializeBitrix();
        return { allowed: true, mode: "bitrix" };
    } catch {
        return {
            allowed: false,
            reason: "No se ha podido inicializar Bitrix24.",
        };
    }
}

export async function initializeBitrix() {
    if (initPromise) return initPromise;

    initPromise = new Promise<BitrixSdk>(async (resolve, reject) => {
        try {
            const bx24 = await loadBitrixSdk();
            const timeoutId = window.setTimeout(() => {
                reject(new Error("Timeout inicializando BX24."));
            }, 8000);

            bx24.init(() => {
                window.clearTimeout(timeoutId);
                resolve(bx24);
            });
        } catch (error) {
            reject(error);
        }
    });

    return initPromise;
}

export async function getBitrixAuth() {
    const bx24 = await initializeBitrix();
    const auth = bx24.getAuth();

    if (!auth?.access_token) {
        throw new Error("Bitrix24 no ha devuelto un token OAuth valido.");
    }

    return auth;
}

export async function getCurrentBitrixUser() {
    const bx24 = await initializeBitrix();

    return new Promise<BitrixUser>((resolve, reject) => {
        bx24.callMethod<BitrixUser>("user.current", {}, (result) => {
            if (result.error?.()) {
                reject(
                    new Error(
                        result.error_description?.() ||
                            "No se pudo obtener el usuario de Bitrix24.",
                    ),
                );
                return;
            }

            resolve(result.data());
        });
    });
}

export async function finishBitrixInstallation() {
    if (!isDirectAccessAllowed() && (!isInsideIframe() || !hasBitrixUrlParams())) {
        throw new Error("La instalacion debe abrirse desde Bitrix24.");
    }

    const bx24 = await initializeBitrix();
    bx24.installFinish();
}

export function getBitrixUserDisplayName(user: BitrixUser) {
    const fullName = [user.NAME, user.LAST_NAME]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");

    return fullName || user.LOGIN || user.EMAIL || "";
}

export function getBitrixUserInitials(displayName: string) {
    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");

    return initials || "BT";
}

function loadBitrixSdk() {
    if (window.BX24) {
        return Promise.resolve(window.BX24);
    }

    if (sdkLoadPromise) return sdkLoadPromise;

    sdkLoadPromise = new Promise<BitrixSdk>((resolve, reject) => {
        const existingScript = document.querySelector<HTMLScriptElement>(
            `script[src="${BITRIX_SDK_URL}"]`,
        );
        const timeoutId = window.setTimeout(() => {
            reject(new Error("Timeout cargando el SDK de Bitrix24."));
        }, 8000);

        const script = existingScript ?? document.createElement("script");
        script.src = BITRIX_SDK_URL;
        script.async = true;

        script.addEventListener("load", () => {
            window.clearTimeout(timeoutId);

            if (window.BX24) {
                resolve(window.BX24);
                return;
            }

            reject(new Error("El SDK de Bitrix24 no esta disponible."));
        });

        script.addEventListener("error", () => {
            window.clearTimeout(timeoutId);
            reject(new Error("No se pudo cargar el SDK de Bitrix24."));
        });

        if (!existingScript) {
            document.head.appendChild(script);
        }
    });

    return sdkLoadPromise;
}

export {};
