const YCLOUD_API_BASE = "https://api.ycloud.com/v2";

// YCloud sometimes delivers inbound numbers without the leading "+"
// (documented gotcha from production use). Normalize to E.164 with "+"
// before using a number as a lookup key or send target.
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

interface SendTextParams {
  apiKey: string;
  from: string;
  to: string;
  body: string;
}

interface SendTemplateParams {
  apiKey: string;
  from: string;
  to: string;
  templateName: string;
  /** e.g. "es" — YCloud/Meta expects the bare language code, not "es_PA". */
  language: string;
  components?: unknown[];
}

async function post(apiKey: string, payload: Record<string, unknown>) {
  const res = await fetch(`${YCLOUD_API_BASE}/whatsapp/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`YCloud send failed (${res.status}): ${detail}`);
  }

  return res.json() as Promise<{ id: string }>;
}

export function sendText({ apiKey, from, to, body }: SendTextParams) {
  return post(apiKey, {
    from: normalizePhone(from),
    to: normalizePhone(to),
    type: "text",
    text: { body },
  });
}

export function sendTemplate({
  apiKey,
  from,
  to,
  templateName,
  language,
  components,
}: SendTemplateParams) {
  return post(apiKey, {
    from: normalizePhone(from),
    to: normalizePhone(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: components ?? [],
    },
  });
}
