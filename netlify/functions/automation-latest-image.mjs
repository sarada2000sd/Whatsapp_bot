import { getRemoteStore, LATEST_IMAGE_KEY } from "./lib/remote-state.mjs";

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  if (request.method !== "GET") return new Response("Method not allowed.", { status: 405 });
  try {
    const data = await getRemoteStore().get(LATEST_IMAGE_KEY, { type: "arrayBuffer", consistency: "strong" });
    if (!data) return new Response("No remote preview has been generated yet.", { status: 404 });
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60, must-revalidate",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return new Response("Remote image storage is not ready: " + String(error.message || error), { status: 503 });
  }
}
