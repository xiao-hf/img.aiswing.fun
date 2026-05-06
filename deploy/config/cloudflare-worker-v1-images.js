const UPSTREAM = "https://gpt.aiswing.fun";
const ALLOWED_PATHS = new Set([
  "/v1/images/generations",
  "/v1/images/edits",
]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "https://img.aiswing.fun",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "https://img.aiswing.fun";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return Response.json(
        { error: { message: "Method Not Allowed" } },
        { status: 405, headers: corsHeaders(origin) },
      );
    }

    if (!ALLOWED_PATHS.has(url.pathname)) {
      return Response.json(
        { error: { message: "Invalid proxy path" } },
        { status: 404, headers: corsHeaders(origin) },
      );
    }

    const upstreamUrl = new URL(url.pathname, UPSTREAM);
    const headers = new Headers(request.headers);
    headers.set("Host", "gpt.aiswing.fun");
    headers.delete("Origin");
    headers.delete("Referer");

    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      responseHeaders.set(key, value);
    }
    responseHeaders.delete("content-encoding");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  },
};
