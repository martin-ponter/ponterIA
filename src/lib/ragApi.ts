import { getBitrixAuth } from "./bitrix";

export type RagUser = {
    bitrixUserId: string;
    domain: string;
    name?: string;
    lastName?: string;
    email?: string;
    role?: string;
};

type ApiSuccess<T> = T & { ok: true };
type ApiError = { ok: false; error?: string; debug?: string };
type ApiResponse<T> = ApiSuccess<T> | ApiError;

type ExchangeResponse = {
    token?: string;
    accessToken?: string;
    expiresInMinutes: number;
    user: RagUser;
};

type MeResponse = {
    user: RagUser;
};

export type RagSource = {
    rank?: number;
    chunkId?: number;
    documentId?: number;
    documentTitle?: string;
    fileName?: string;
    areaSlug?: string;
    pageStart?: number;
    pageEnd?: number;
    similarityScore?: number;
    preview?: string;
};

export type RagChatArea = {
    rawAreaSlug?: string | null;
    effectiveAreaSlug?: string | null;
    filterMode?: "all" | "specific";
};

export type RagChatResponse = {
    conversationId?: number;
    userMessageId?: number;
    assistantMessageId?: number;
    answer: string;
    sources?: RagSource[];
    area?: RagChatArea;
    user?: RagUser;
};

export const RAG_TOKEN_STORAGE_KEY = "PONTER_RAG_TOKEN";

const DEFAULT_API_BASE_URL =
    "https://ponter-functions-ekgcaxdve6cwbxhy.spaincentral-01.azurewebsites.net/api";

const API_BASE_URL = (
    import.meta.env.PUBLIC_RAG_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

export async function initRagAuth() {
    if (!window.BX24) {
        throw new Error("Esta app debe abrirse desde Bitrix24");
    }

    const auth = await getBitrixAuth();
    const bitrixDomain = extractBitrixDomain({
        domain: auth.domain,
        clientEndpoint: auth.client_endpoint,
    });

    let response: ExchangeResponse;

    try {
        response = await fetchJson<ExchangeResponse>(
            "/auth/bitrix/exchange",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    bitrixDomain,
                    accessToken: auth.access_token,
                    domain: bitrixDomain,
                }),
            },
        );
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "Bitrix domain is not allowed"
        ) {
            throw new Error(
                `Bitrix domain is not allowed: ${bitrixDomain}`,
            );
        }

        throw error;
    }

    const ragToken = response.token || response.accessToken;

    if (!ragToken) {
        throw new Error("El backend RAG no ha devuelto token de sesion.");
    }

    sessionStorage.setItem(RAG_TOKEN_STORAGE_KEY, ragToken);

    return response.user;
}

export async function getCurrentRagUser() {
    const token = getStoredRagToken();

    return fetchJson<MeResponse>("/auth/me", {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    }).then((data) => data.user);
}

export async function debugCurrentRagAuth() {
    return {
        hasToken: Boolean(sessionStorage.getItem(RAG_TOKEN_STORAGE_KEY)),
        user: await getCurrentRagUser(),
    };
}

export async function askRag({
    message,
    areaSlug = null,
    conversationId,
}: {
    message: string;
    areaSlug?: string | null;
    conversationId?: number | null;
}) {
    const token = getStoredRagToken();
    const normalizedAreaSlug = normalizeAreaSlug(areaSlug);

    try {
        const data = await fetchJson<RagChatResponse>("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                message,
                ...(normalizedAreaSlug
                    ? { areaSlug: normalizedAreaSlug }
                    : { areaSlug: null }),
                ...(conversationId ? { conversationId } : {}),
            }),
        });

        return data;
    } catch (error) {
        if (error instanceof Error && isRagAuthError(error.message)) {
            sessionStorage.removeItem(RAG_TOKEN_STORAGE_KEY);
        }

        throw error;
    }
}

function normalizeAreaSlug(areaSlug?: string | null) {
    const normalized = areaSlug?.trim().toLowerCase();

    return normalized === "fiscal" || normalized === "laboral"
        ? normalized
        : null;
}

export function clearRagToken() {
    sessionStorage.removeItem(RAG_TOKEN_STORAGE_KEY);
}

export function getRagUserDisplayName(user: RagUser) {
    const fullName = [user.name, user.lastName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");

    return fullName || user.email || "Usuario de Bitrix no disponible";
}

export function getRagUserInitials(displayName: string) {
    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");

    return initials || "BT";
}

function getStoredRagToken() {
    const token = sessionStorage.getItem(RAG_TOKEN_STORAGE_KEY);

    if (!token) {
        throw new Error("No hay token RAG. Vuelve a abrir la app desde Bitrix24.");
    }

    return token;
}

async function fetchJson<T>(path: string, init?: RequestInit) {
    let response: Response;

    try {
        response = await fetch(`${API_BASE_URL}${path}`, init);
    } catch {
        throw new Error(
            "No se pudo conectar con el backend RAG. Revisa CORS en Azure Functions para permitir este dominio de Vercel.",
        );
    }

    const data = (await response.json().catch(() => ({
        ok: false,
        error: "Respuesta no valida del backend.",
    }))) as ApiResponse<T>;

    if (!response.ok || !data.ok) {
        const isDevelopment = import.meta.env.DEV;
        const debugMessage =
            isDevelopment && "debug" in data && data.debug
                ? data.debug
                : undefined;
        const errorMessage =
            "error" in data && data.error
                ? data.error
                : "Error comunicando con el backend RAG.";

        throw new Error(
            response.status === 401
                ? `RAG auth error: ${errorMessage}`
                : debugMessage || errorMessage,
        );
    }

    return data;
}

function extractBitrixDomain({
    domain,
    clientEndpoint,
}: {
    domain?: string;
    clientEndpoint?: string;
}) {
    const candidates = [
        domain,
        getUrlParam("DOMAIN"),
        getUrlParam("domain"),
        getHostFromUrl(clientEndpoint),
        getHostFromUrl(document.referrer),
    ];

    const detectedDomain = candidates
        .map((candidate) => candidate?.trim())
        .find(Boolean);

    if (!detectedDomain) {
        throw new Error("No se pudo detectar el dominio de Bitrix24.");
    }

    return detectedDomain;
}

function getUrlParam(name: string) {
    return new URLSearchParams(window.location.search).get(name) || undefined;
}

function getHostFromUrl(value?: string) {
    if (!value) return undefined;

    try {
        return new URL(value).host;
    } catch {
        try {
            return new URL(`https://${value}`).host;
        } catch {
            return undefined;
        }
    }
}

export function isRagAuthError(error: string) {
    const normalizedError = error.toLowerCase();

    return (
        error === "RAG token expired" ||
        error === "Invalid RAG token" ||
        normalizedError.includes("rag auth error") ||
        normalizedError.includes("token invalido") ||
        normalizedError.includes("token inválido") ||
        normalizedError.includes("token caducado") ||
        normalizedError.includes("expired") ||
        normalizedError.includes("invalid rag token")
    );
}
