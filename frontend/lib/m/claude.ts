const API = "https://api.anthropic.com/v1/messages";

export function claudeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function callClaude(body: {
  system: string;
  messages: unknown[];
  max_tokens: number;
  temperature?: number;
}): Promise<string> {
  const send = (b: object) =>
    fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        ...(process.env.ANTHROPIC_WORKSPACE_ID
          ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
          : {}),
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        ...b,
      }),
    });
  let res = await send(body);
  if (res.status === 400 && body.temperature !== undefined) {
    const t = await res.clone().text();
    if (/temperature/i.test(t)) {
      // Model does not accept a temperature setting: retry without it.
      const { temperature: _t, ...rest } = body;
      void _t;
      res = await send(rest);
    }
  }
  if (!res.ok) {
    const raw = await res.text();
    let msg = raw.slice(0, 200);
    try {
      msg = JSON.parse(raw)?.error?.message ?? msg;
    } catch {
      // keep raw text
    }
    throw new Error(`${msg} (${res.status})`);
  }
  const data = await res.json();
  return (data.content ?? [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("");
}
