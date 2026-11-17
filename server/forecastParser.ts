import { ForecastDirection, ForecastResult, MarketSnapshot, NewsItem } from '../src/types';

export interface ForecastParseOutcome {
  success: boolean;
  result?: Omit<ForecastResult, 'modelName' | 'providerName' | 'responseTimeMs' | 'createdAtUtc'>;
  errorMessage?: string;
}

export function buildAnalysisPrompt(
  news: NewsItem[],
  lang: 'ru' | 'en' = 'ru',
  market?: MarketSnapshot | null,
  hasImage = true
): string {
  const lines: string[] = [];

  if (lang === 'en') {
    lines.push('You are a cryptocurrency technical and news market analyst.');
    if (hasImage) {
      lines.push('The attached screenshot shows the PEARL/USDT trading chart on the SafeTrade exchange.');
      lines.push(
        'Your task: analyze candlesticks, trend, volume, price levels on the chart, the live market telemetry below, and the real news items, then return strictly valid JSON with no extra text outside JSON.'
      );
      lines.push('');
      lines.push('CRITICAL RULE:');
      lines.push(
        'If numbers on the price axis in the screenshot are unreadable AND live market telemetry is unavailable — output null for missing numeric fields and [] for support/resistance. NEVER invent or guess numbers!'
      );
    } else {
      lines.push('No chart screenshot is attached for this run. Analyze PEARL/USDT using ONLY the live market telemetry, OHLC candles, and real news items below.');
      lines.push('Return strictly valid JSON with no extra text outside JSON. NEVER invent prices not supported by the live telemetry.');
    }

    if (market) {
      lines.push('');
      lines.push(`Live Market Telemetry (${market.symbol} via ${market.primaryExchange}):`);
      lines.push(`- Current Price USD/USDT: ${market.priceUsd}`);
      if (market.priceChange24hPercent !== null) {
        lines.push(`- 24h Change: ${market.priceChange24hPercent.toFixed(2)}%`);
      }
      if (market.high24h !== null && market.low24h !== null) {
        lines.push(`- 24h Range: Low ${market.low24h} / High ${market.high24h}`);
      }
      if (market.volume24hUsd !== null) {
        lines.push(`- 24h Volume USD: $${Math.round(market.volume24hUsd)}`);
      }
      if (market.spreadPercent !== null) {
        lines.push(`- Bid/Ask Spread: ${market.spreadPercent.toFixed(2)}%`);
      }
      if (market.anomalies.length > 0) {
        lines.push(`- Detected Anomalies: ${market.anomalies.join('; ')}`);
      }
      if (market.ohlc.length > 0) {
        const recent = market.ohlc.slice(-6).map(
          (c) =>
            `[${new Date(c.timestamp).toISOString().slice(11, 16)} O:${c.open} H:${c.high} L:${c.low} C:${c.close}]`
        );
        lines.push(`- Recent 30m OHLC candles: ${recent.join(' ')}`);
      }
    }

    lines.push('');
    lines.push('Latest news:');
    if (news.length === 0) {
      lines.push('- No news found for the configured keywords.');
    } else {
      for (const item of news.slice(0, 12)) {
        const tag = item.relevance === 'DirectPearl' ? '[PEARL]' : '[MARKET]';
        const sent = item.sentiment ? `[${item.sentiment}]` : '';
        lines.push(`- ${tag}${sent} [${item.formattedDate}] (${item.source}) ${item.title}`);
      }
    }
    lines.push('');
    lines.push('Return ONLY JSON with this exact structure:');
    lines.push(`{
  "price_now": number | null,
  "direction": "up" | "down" | "sideways",
  "confidence": integer (0..100),
  "support": [number],
  "resistance": [number],
  "target_price": number | null,
  "stop_price": number | null,
  "chart_reasons": ["chart reason string"],
  "news_impact": "brief summary of news impact",
  "news_reasons": ["news factor"],
  "risks": ["key risk"]
}`);
    lines.push('Write all text field values in English.');
  } else {
    lines.push('Ты — технический и новостной аналитик криптовалютного рынка.');
    if (hasImage) {
      lines.push('На прикреплённом скриншоте показан график пары PEARL/USDT на бирже SafeTrade.');
      lines.push(
        'Твоя задача: проанализировать свечи, тренд, объёмы, уровни на графике, живые рыночные показатели ниже и реальные новости, и вернуть строго валидный JSON без пояснений вне JSON.'
      );
      lines.push('');
      lines.push('КРИТИЧЕСКИ ВАЖНОЕ ПРАВИЛО:');
      lines.push(
        'Если цифры на шкале цен на скриншоте не читаются И живых рыночных данных недостаточно — пиши null для неизвестных числовых полей и пустой массив [] для support/resistance. НИКОГДА не выдумывай и не угадывай числа!'
      );
    } else {
      lines.push('Скриншот графика не прикреплён — проведи анализ PEARL/USDT ТОЛЬКО на основе живой рыночной телеметрии, OHLC-свечей и реальных новостей ниже.');
      lines.push('Верни строго валидный JSON без пояснений вне JSON. НИКОГДА не выдумывай цены, которых нет в данных.');
    }

    if (market) {
      lines.push('');
      lines.push(`Живая рыночная телеметрия (${market.symbol}, источник: ${market.primaryExchange}):`);
      lines.push(`- Текущая цена USDT: ${market.priceUsd}`);
      if (market.priceChange24hPercent !== null) {
        lines.push(`- Изменение за 24ч: ${market.priceChange24hPercent.toFixed(2)}%`);
      }
      if (market.high24h !== null && market.low24h !== null) {
        lines.push(`- Диапазон 24ч: Мин ${market.low24h} / Макс ${market.high24h}`);
      }
      if (market.volume24hUsd !== null) {
        lines.push(`- Объём 24ч USD: $${Math.round(market.volume24hUsd)}`);
      }
      if (market.spreadPercent !== null) {
        lines.push(`- Спред Bid/Ask: ${market.spreadPercent.toFixed(2)}%`);
      }
      if (market.anomalies.length > 0) {
        lines.push(`- Зафиксированные аномалии: ${market.anomalies.join('; ')}`);
      }
      if (market.ohlc.length > 0) {
        const recent = market.ohlc.slice(-6).map(
          (c) =>
            `[${new Date(c.timestamp).toISOString().slice(11, 16)} O:${c.open} H:${c.high} L:${c.low} C:${c.close}]`
        );
        lines.push(`- Последние 30м OHLC-свечи: ${recent.join(' ')}`);
      }
    }

    lines.push('');
    lines.push('Свежие новости:');
    if (news.length === 0) {
      lines.push('- Новостей по ключевым словам не найдено.');
    } else {
      for (const item of news.slice(0, 12)) {
        const tag = item.relevance === 'DirectPearl' ? '[PEARL]' : '[РЫНОК]';
        const sent = item.sentiment ? `[${item.sentiment}]` : '';
        lines.push(`- ${tag}${sent} [${item.formattedDate}] (${item.source}) ${item.title}`);
      }
    }
    lines.push('');
    lines.push('Верни ТОЛЬКО JSON со следующей точной структурой:');
    lines.push(`{
  "price_now": number | null,
  "direction": "up" | "down" | "sideways",
  "confidence": integer (0..100),
  "support": [number],
  "resistance": [number],
  "target_price": number | null,
  "stop_price": number | null,
  "chart_reasons": ["строка причины по графику"],
  "news_impact": "краткое описание влияния новостей",
  "news_reasons": ["новостной фактор"],
  "risks": ["основной риск"]
}`);
    lines.push('Отвечай на русском языке внутри текстовых полей.');
  }

  return lines.join('\n');
}

export function buildRetryPrompt(parseError: string): string {
  return (
    `Твой предыдущий ответ не удалось разобрать как корректный JSON (${parseError}). ` +
    'Верни ТОЛЬКО один валидный JSON-объект без markdown-блоков и лишнего текста со схемой: ' +
    '{"price_now": number|null, "direction": "up"|"down"|"sideways", "confidence": 0..100, ' +
    '"support": [], "resistance": [], "target_price": number|null, "stop_price": number|null, ' +
    '"chart_reasons": [], "news_impact": "", "news_reasons": [], "risks": []}.'
  );
}

export function tryParseForecast(rawResponse: string): ForecastParseOutcome {
  if (!rawResponse || !rawResponse.trim()) {
    return { success: false, errorMessage: 'Пустой ответ от модели.' };
  }

  const jsonText = extractJsonObject(rawResponse);
  if (!jsonText) {
    return { success: false, errorMessage: 'В ответе модели не найден JSON-объект.' };
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { success: false, errorMessage: 'Корневой элемент ответа не является JSON-объектом.' };
    }

    const obj = parsed as Record<string, unknown>;
    const directionRaw = getString(obj, 'direction')?.trim().toLowerCase();
    let direction: ForecastDirection = ForecastDirection.Unknown;

    if (directionRaw === 'up' || directionRaw === 'bullish' || directionRaw === 'long') {
      direction = ForecastDirection.Up;
    } else if (directionRaw === 'down' || directionRaw === 'bearish' || directionRaw === 'short') {
      direction = ForecastDirection.Down;
    } else if (
      directionRaw === 'sideways' ||
      directionRaw === 'flat' ||
      directionRaw === 'neutral' ||
      directionRaw === 'range'
    ) {
      direction = ForecastDirection.Sideways;
    }

    if (direction === ForecastDirection.Unknown) {
      return {
        success: false,
        errorMessage: `Некорректное значение direction: '${directionRaw ?? 'null'}'.`,
      };
    }

    const confidenceNum = getNullableNumber(obj, 'confidence');
    if (confidenceNum === null) {
      return { success: false, errorMessage: 'Отсутствует числовое поле confidence.' };
    }

    const confidence = Math.max(0, Math.min(100, Math.round(confidenceNum)));

    return {
      success: true,
      result: {
        priceNow: getNullableNumber(obj, 'price_now'),
        direction,
        confidence,
        support: getNumberList(obj, 'support'),
        resistance: getNumberList(obj, 'resistance'),
        targetPrice: getNullableNumber(obj, 'target_price'),
        stopPrice: getNullableNumber(obj, 'stop_price'),
        chartReasons: getStringList(obj, 'chart_reasons'),
        newsImpact: getString(obj, 'news_impact') ?? '',
        newsReasons: getStringList(obj, 'news_reasons'),
        risks: getStringList(obj, 'risks'),
        rawJson: jsonText,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, errorMessage: `Ошибка разбора JSON: ${msg}` };
  }
}

function extractJsonObject(raw: string): string | null {
  let trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline >= 0) trimmed = trimmed.slice(firstNewline + 1);
    const lastFence = trimmed.lastIndexOf('```');
    if (lastFence >= 0) trimmed = trimmed.slice(0, lastFence);
    trimmed = trimmed.trim();
  }

  const start = trimmed.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }

  return null;
}

function getPropertyCaseInsensitive(obj: Record<string, unknown>, name: string): unknown {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function getString(obj: Record<string, unknown>, prop: string): string | null {
  const val = getPropertyCaseInsensitive(obj, prop);
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return JSON.stringify(val);
}

function parseNumber(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string') {
    const cleaned = val.trim().replaceAll('$', '').replaceAll(',', '.');
    if (!cleaned || cleaned.toLowerCase() === 'null') return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getNullableNumber(obj: Record<string, unknown>, prop: string): number | null {
  return parseNumber(getPropertyCaseInsensitive(obj, prop));
}

function getNumberList(obj: Record<string, unknown>, prop: string): number[] {
  const val = getPropertyCaseInsensitive(obj, prop);
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) {
    return val.map(parseNumber).filter((n): n is number => n !== null);
  }
  const single = parseNumber(val);
  return single !== null ? [single] : [];
}

function getStringList(obj: Record<string, unknown>, prop: string): string[] {
  const val = getPropertyCaseInsensitive(obj, prop);
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
      .filter((s) => s.length > 0 && s.toLowerCase() !== 'null');
  }
  const single = String(val).trim();
  return single.length > 0 && single.toLowerCase() !== 'null' ? [single] : [];
}
