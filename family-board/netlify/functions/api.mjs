import { getStore } from "@netlify/blobs";
import { handle } from "./lib.mjs";

export default async (req) => {
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only." }), { status: 405, headers });
  }
  let input;
  try {
    input = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Bad request." }), { status: 400, headers });
  }
  try {
    const store = getStore({ name: "family-board", consistency: "strong" });
    const out = await handle(input, store, process.env, Date.now());
    return new Response(JSON.stringify(out.body), { status: out.status, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error." }), { status: 500, headers });
  }
};

export const config = { path: "/api" };
