import type { APIRoute } from "astro";

export const prerender = false;

function toQueryString(data: Record<string, string>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  }

  return params.toString();
}

async function extractParams(request: Request) {
  const url = new URL(request.url);
  const result: Record<string, string> = {};

  for (const [key, value] of url.searchParams.entries()) {
    result[key] = value;
  }

  const contentType = request.headers.get("content-type") || "";

  if (request.method === "POST") {
    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        result[key] = String(value);
      }
    } else if (contentType.includes("application/json")) {
      try {
        const json = await request.json();
        if (json && typeof json === "object") {
          for (const [key, value] of Object.entries(json)) {
            result[key] = String(value ?? "");
          }
        }
      } catch {
        // ignorar
      }
    } else {
      try {
        const text = await request.text();
        const bodyParams = new URLSearchParams(text);
        for (const [key, value] of bodyParams.entries()) {
          result[key] = value;
        }
      } catch {
        // ignorar
      }
    }
  }

  return result;
}

async function handleRequest(request: Request) {
  const params = await extractParams(request);
  const query = toQueryString(params);
  const currentUrl = new URL(request.url);
  const targetUrl = new URL("/", currentUrl);

  targetUrl.search = query;

  return Response.redirect(targetUrl, request.method === "POST" ? 303 : 302);
}

export const GET: APIRoute = async ({ request }) => handleRequest(request);
export const POST: APIRoute = async ({ request }) => handleRequest(request);