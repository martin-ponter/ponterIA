import type { APIRoute } from "astro";

const AZURE_RAG_API_BASE_URL = (
    import.meta.env.RAG_API_BASE_URL ||
    "https://ponter-functions-ekgcaxdve6cwbxhy.spaincentral-01.azurewebsites.net/api"
).replace(/\/$/, "");

const FORWARDED_HEADERS = new Set([
    "accept",
    "authorization",
    "content-type",
]);

export const ALL: APIRoute = async ({ params, request }) => {
    const path = params.path ?? "";
    const sourceUrl = new URL(request.url);
    const targetUrl = new URL(
        `${AZURE_RAG_API_BASE_URL}/${path.replace(/^\/+/, "")}`,
    );

    targetUrl.search = sourceUrl.search;

    const headers = new Headers();
    request.headers.forEach((value, key) => {
        if (FORWARDED_HEADERS.has(key.toLowerCase())) {
            headers.set(key, value);
        }
    });

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
    });

    const responseHeaders = new Headers();
    const contentType = response.headers.get("content-type");

    if (contentType) {
        responseHeaders.set("content-type", contentType);
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
    });
};
