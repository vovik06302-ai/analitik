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
        }
      );
      if (tgRes.ok) {
        telegramSent = true;
      } else {
        errors.push(`Telegram HTTP ${tgRes.status}`);
      }
    } catch (err) {
      errors.push(
        `Telegram: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const webhook = payload.webhookUrl?.trim();
  if (webhook) {
    try {
      const parsed = new URL(webhook);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const whRes = await fetch(parsed.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `**${payload.title}**\n${payload.message}`,
            title: payload.title,
            message: payload.message,
            timestamp: new Date().toISOString(),
          }),
        });
        if (whRes.ok) {
          webhookSent = true;
        } else {
          errors.push(`Webhook HTTP ${whRes.status}`);
        }
      }
    } catch (err) {
      errors.push(
        `Webhook: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { telegramSent, webhookSent, errors };
}
