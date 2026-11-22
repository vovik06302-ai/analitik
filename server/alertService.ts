export interface AlertPayload {
  title: string;
  message: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  webhookUrl?: string;
}

export interface AlertDispatchResult {
  telegramSent: boolean;
  webhookSent: boolean;
  errors: string[];
}

export function isSafePublicUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function dispatchExternalAlerts(
  payload: AlertPayload
): Promise<AlertDispatchResult> {
  const errors: string[] = [];
  let telegramSent = false;
  let webhookSent = false;

  const botToken = payload.telegramBotToken?.trim();
  const chatId = payload.telegramChatId?.trim();
  if (botToken && chatId) {
    try {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `${payload.title}\n\n${payload.message}`,
          }),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (tgRes.ok) {
        telegramSent = true;
      } else {
        errors.push(`Telegram HTTP ${tgRes.status}`);
      }
    } catch (err) {
      errors.push(`Telegram: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const webhook = payload.webhookUrl?.trim();
  if (webhook) {
    if (!isSafePublicUrl(webhook)) {
      errors.push('Webhook URL blocked (must be a public http/https address).');
    } else {
      try {
        const parsed = new URL(webhook);
        const whRes = await fetch(parsed.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `**${payload.title}**\n${payload.message}`,
            title: payload.title,
            message: payload.message,
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (whRes.ok) {
          webhookSent = true;
        } else {
          errors.push(`Webhook HTTP ${whRes.status}`);
        }
      } catch (err) {
        errors.push(`Webhook: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { telegramSent, webhookSent, errors };
}
