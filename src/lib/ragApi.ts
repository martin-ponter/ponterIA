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
type ApiError = { ok: false; error?: string };
type ApiResponse<T> = ApiSuccess<T> | ApiError;

type ExchangeResponse = {
    tokenType: "Bearer";
    accessToken: string;
    expiresInMinutes: number;
    user: RagUser;
};

type MeResponse = {
    user: RagUser;
};

type ChatResponse = {
    answer: string;
    receivedMessage?: string;
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
    const response = await fetchJson<ExchangeResponse>(
        "/auth/bitrix/exchange",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                accessToken: auth.access_token,
                domain: bitrixDomain,
            }),
        },
    );

    sessionStorage.setItem(RAG_TOKEN_STORAGE_KEY, response.accessToken);

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

export async function askRag(message: string) {
    const token = getStoredRagToken();

    try {
        const data = await fetchJson<ChatResponse>("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ message }),
        });

        return data.answer;
    } catch (error) {
        if (error instanceof Error && isRagAuthError(error.message)) {
            sessionStorage.removeItem(RAG_TOKEN_STORAGE_KEY);
        }

        throw error;
    }
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
    const response = await fetch(`${API_BASE_URL}${path}`, init);
    const data = (await response.json().catch(() => ({
        ok: false,
        error: "Respuesta no valida del backend.",
    }))) as ApiResponse<T>;

    if (!response.ok || !data.ok) {
        throw new Error(
            "error" in data && data.error
                ? data.error
                : "Error comunicando con el backend RAG.",
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
    return error === "RAG token expired" || error === "Invalid RAG token";
}
