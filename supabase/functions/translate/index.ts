// Translates texts of the uniform guide between ca, en, it, fr and de.
// Only approved administrators may call it (checked with the caller's own session).
// Provider: Anthropic (secret ANTHROPIC_API_KEY) or, if that is missing, DeepL (secret DEEPL_API_KEY).
import { createClient } from "jsr:@supabase/supabase-js@2";

const LANG: Record<string, string> = { ca: "Catalan", en: "English", it: "Italian", fr: "French", de: "German" };
const DEEPL: Record<string, string> = { ca: "CA", en: "EN-GB", it: "IT", fr: "FR", de: "DE" };
const MAX_CHARS = 60000;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function viaAnthropic(key: string, texts: string[], source: string, target: string): Promise<string[]> {
  const prompt =
    `Translate each string of the JSON array below from ${LANG[source]} into ${LANG[target]}.\n` +
    `Context: a reference guide on the uniform of a French Napoleonic light infantry regiment (9e Léger, 1809), written for reenactors.\n` +
    `Rules:\n- Keep every HTML tag and attribute exactly as it is; translate only the visible text.\n` +
    `- Keep markers such as [[3]] unchanged.\n- Keep French technical names of uniform items (shako, habit-veste, giberne, briquet, buffleterie, guêtres...) and quotations in French unchanged when they appear in italics or quotes.\n` +
    `- Keep numbers and units unchanged. Use a clear, formal register.\n` +
    `- Answer with the JSON array only: same length, same order, one translated string per input string.\n\n` +
    JSON.stringify(texts);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 16000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const text: string = (data.content || []).map((c: { text?: string }) => c.text || "").join("").trim();
  const start = text.indexOf("["), end = text.lastIndexOf("]");
  const out = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(out) || out.length !== texts.length) throw new Error("Translation returned a different number of strings");
  return out.map((x) => String(x));
}

async function viaDeepL(key: string, texts: string[], source: string, target: string): Promise<string[]> {
  const host = key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const r = await fetch(`${host}/v2/translate`, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: texts, source_lang: DEEPL[source].slice(0, 2), target_lang: DEEPL[target], tag_handling: "html" }),
  });
  if (!r.ok) throw new Error(`DeepL ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return (data.translations || []).map((x: { text: string }) => x.text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, anon, { global: { headers: { Authorization: auth } } });
    const { data: isAdmin, error } = await sb.rpc("is_admin");
    if (error || isAdmin !== true) return json({ error: "forbidden" }, 403);

    const { source, targets, texts } = await req.json();
    if (!LANG[source] || !Array.isArray(targets) || !targets.every((t: string) => LANG[t] && t !== source)) return json({ error: "bad languages" }, 400);
    if (!Array.isArray(texts) || !texts.every((t: unknown) => typeof t === "string")) return json({ error: "bad texts" }, 400);
    if (texts.join("").length > MAX_CHARS) return json({ error: "too much text in one request" }, 413);

    // empty strings are not sent to the provider
    const idx = texts.map((t: string, i: number) => (t.trim() ? i : -1)).filter((i: number) => i >= 0);
    const payload = idx.map((i: number) => texts[i]);
    const aKey = Deno.env.get("ANTHROPIC_API_KEY"), dKey = Deno.env.get("DEEPL_API_KEY");
    if (!aKey && !dKey) return json({ error: "no translation provider configured" }, 503);

    const translations: Record<string, string[]> = {};
    await Promise.all(targets.map(async (target: string) => {
      const res = payload.length ? (aKey ? await viaAnthropic(aKey, payload, source, target) : await viaDeepL(dKey!, payload, source, target)) : [];
      const full = texts.map(() => "");
      idx.forEach((i: number, j: number) => { full[i] = res[j]; });
      translations[target] = full;
    }));
    return json({ translations });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
