/** Minimal client for the Mailpit REST API (https://mailpit.axllent.org/docs/api-v1/). */
export const MAILPIT_API = process.env.MAILPIT_API ?? 'http://127.0.0.1:8025/api/v1';

export interface MailpitAddress {
  Name: string;
  Address: string;
}

export interface MailpitMessage {
  ID: string;
  Subject: string;
  To: MailpitAddress[];
  Text: string;
}

interface MailpitSummary {
  ID: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${MAILPIT_API}${path}`);
  if (!res.ok) throw new Error(`Mailpit ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function totalMessages(): Promise<number> {
  const info = await getJson<{ Messages: number }>('/info');
  return info.Messages;
}

/** Full messages whose subject/body contain `needle` (exact phrase search). */
export async function findMessages(needle: string): Promise<MailpitMessage[]> {
  const query = encodeURIComponent(`"${needle}"`);
  const result = await getJson<{ messages: MailpitSummary[] }>(`/search?query=${query}&limit=50`);
  return Promise.all(result.messages.map((m) => getJson<MailpitMessage>(`/message/${m.ID}`)));
}

export async function waitForMessages(needle: string, expected = 1, timeoutMs = 5000): Promise<MailpitMessage[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const messages = await findMessages(needle);
    if (messages.length >= expected) return messages;
    if (Date.now() > deadline) {
      throw new Error(`Mailpit: expected ${expected} message(s) containing "${needle}", got ${messages.length}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

export function extractCode(text: string): string {
  const match = text.match(/Код подтверждения: ([A-Z0-9]{8})/);
  if (!match) throw new Error('Confirmation code not found in email body');
  return match[1];
}
