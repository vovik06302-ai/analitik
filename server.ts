import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { XMLParser } from 'fast-xml-parser';
import {
  AiProviderType,
  APP_VERSION,
  ConsensusSummary,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OLLAMA_URL,
  ForecastDirection,
  ForecastHistoryEntry,
  ForecastHorizonHours,
  ForecastOutcomeStatus,
  ForecastResult,
  MarketSnapshot,
  ModelVote,
  NewsItem,
  OhlcCandle,
  ServiceConnectionState,
} from './src/types';
import {
  buildAnalysisPrompt,
  buildRetryPrompt,
  tryParseForecast,
  validateForecastGuardrails,
} from './server/forecastParser';
import { keyVault } from './server/keyVault';
import {
  fetchPearlCandlesInRange,
  fetchPearlMarketSnapshot,
  fetchPearlPriceNearTime,
} from './server/marketService';
import { buildCryptoNewsQuery, prioritizeAndSelectNews } from './server/newsRadar';
import { forecastDb } from './server/database';
import { dispatchExternalAlerts, isSafePublicUrl } from './server/alertService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const RSS_TIMEOUT_MS = 7000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function cleanXmlText(input: unknown): string {
  if (input === undefined || input === null) return '';
  let str = '';
  if (typeof input === 'string' || typeof input === 'number') {
    str = String(input);
  } else if (typeof input === 'object' && '#text' in (input as Record<string, unknown>)) {
    str = String((input as Record<string, unknown>)['#text'] ?? '');
  }
  const decoded = decodeHtmlEntities(str);
  return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatNewsDate(isoOrRaw: string | null): string {
  if (!isoOrRaw) return 'нет даты';
  const d = new Date(isoOrRaw);
  if (Number.isNaN(d.getTime())) return 'нет даты';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function parseRssOrAtom(xmlContent: string, fallbackHost: string, queryTag: string): NewsItem[] {
  const items: NewsItem[] = [];
  const doc = xmlParser.parse(xmlContent);

  const channel = doc?.rss?.channel;
  if (channel) {
    const channelTitle = cleanXmlText(channel.title);
    for (const itemEl of extractArray<Record<string, unknown>>(channel.item)) {
      let title = cleanXmlText(itemEl.title);
      const link = cleanXmlText(itemEl.link);
      const source = cleanXmlText(itemEl.source);
      const pubDateRaw = cleanXmlText(itemEl.pubDate ?? itemEl['dc:date'] ?? itemEl.date);

      if (!title) continue;

      if (source && title.toLowerCase().endsWith(` - ${source.toLowerCase()}`)) {
        title = title.slice(0, title.length - source.length - 3).trim();
      }

      const parsedDate = pubDateRaw ? new Date(pubDateRaw) : null;
      const publishedAt =
        parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;

      items.push({
        title,
        link,
        source: source || channelTitle || fallbackHost,
        publishedAt,
        matchedQuery: queryTag,
        formattedDate: formatNewsDate(publishedAt),
      });
    }
    if (items.length > 0) return items;
  }

  const feed = doc?.feed;
  if (feed) {
    const feedTitle = cleanXmlText(feed.title);
    for (const entry of extractArray<Record<string, unknown>>(feed.entry)) {
      const title = cleanXmlText(entry.title);
      if (!title) continue;

      const links = extractArray<Record<string, unknown> | string>(
        entry.link as Record<string, unknown> | string
      );
      let link = '';
      for (const l of links) {
        if (typeof l === 'string') {
          link = l.trim();
          break;
        }
        const rel = l?.['@_rel'];
        if (!rel || rel === 'alternate') {
          link = String(l?.['@_href'] ?? '').trim();
          break;
        }
      }

      const dateRaw = cleanXmlText(entry.published ?? entry.updated);
      const parsedDate = dateRaw ? new Date(dateRaw) : null;
      const publishedAt =
        parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;

      items.push({
        title,
        link,
        source: feedTitle || fallbackHost,
        publishedAt,
        matchedQuery: queryTag,
        formattedDate: formatNewsDate(publishedAt),
      });
    }
  }

  return items;
}

async function fetchFeedSafe(
  urlStr: string,
  queryTag: string,
  errors: Set<string>
): Promise<NewsItem[]> {
  if (!isSafePublicUrl(urlStr)) {
    return [];
  }
  const parsedUrl = new URL(urlStr);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);

  try {
    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PearlAiAnalyst/1.0.29 (+https://github.com/vovik06302-ai/analitik)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      errors.add(`Источник ${parsedUrl.hostname} вернул HTTP ${response.status}.`);
      return [];
    }

    const xml = await response.text();
    return parseRssOrAtom(xml, parsedUrl.hostname, queryTag);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      errors.add(
        `Превышено время ожидания ответа от ${parsedUrl.hostname} (${Math.round(
          RSS_TIMEOUT_MS / 1000
        )} с).`
      );
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      errors.add(`${parsedUrl.hostname}: ${msg}`);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function normalizeOllamaUrl(url?: string): string {
  const trimmed = (url ?? '').trim();
  const candidate = (trimmed || process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return DEFAULT_OLLAMA_URL;
    }
    return candidate;
  } catch {
    return DEFAULT_OLLAMA_URL;
  }
}

function normalizeHorizonHours(raw: unknown): ForecastHorizonHours {
  const n = Number(raw);
  if (n === 1) return 1;
  if (n === 2) return 2;
  return 4;
}

function stripDataUrlPrefix(base64OrDataUrl: string): { data: string; mimeType: string } {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(base64OrDataUrl.trim());
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: 'image/png', data: base64OrDataUrl.trim() };
}

interface ProviderRunParams {
  provider: AiProviderType;
  model: string;
  imageInput: string;
  news: NewsItem[];
  lang: 'ru' | 'en';
  horizonHours: ForecastHorizonHours;
  recentHistory: ForecastHistoryEntry[];
  market?: MarketSnapshot | null;
  claudeApiKey?: string;
  ollamaUrl?: string;
}

async function analyzeWithProvider(params: ProviderRunParams): Promise<ForecastResult> {
  const {
    provider,
    model,
    imageInput,
    news,
    lang,
    horizonHours,
    recentHistory,
    market,
    claudeApiKey,
    ollamaUrl,
  } = params;
  const hasImage = Boolean(imageInput.trim());
  const { data: base64Data, mimeType } = hasImage
    ? stripDataUrlPrefix(imageInput)
    : { data: '', mimeType: 'image/png' };

  const prompt = buildAnalysisPrompt(news, lang, market, hasImage, horizonHours, recentHistory);
  const startedAt = Date.now();

  if (provider === AiProviderType.Gemini) {
    const apiKey = keyVault.decryptGeminiKey();
    if (!apiKey) {
      throw new Error(
        lang === 'en'
          ? 'GEMINI_API_KEY is not configured on the server.'
          : 'Серверный ключ GEMINI_API_KEY не задан.'
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 28000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const selectedModel = model || DEFAULT_GEMINI_MODEL;
    const geminiModelsToTry =
      selectedModel === DEFAULT_GEMINI_MODEL
        ? [selectedModel, 'gemini-3.1-flash-lite']
        : [selectedModel];

    let lastGeminiErrMsg = '';
    let fallbackReason = '';

    for (let mIdx = 0; mIdx < geminiModelsToTry.length; mIdx++) {
      const activeGeminiModel = geminiModelsToTry[mIdx];
      const isFallbackModel = mIdx > 0;
      let lastError = '';
      let currentPrompt = prompt;
      let shouldFallbackModel = false;

      for (let attempt = 1; attempt <= 2; attempt++) {
        const parts: Array<Record<string, unknown>> = [];
        if (hasImage) {
          parts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        }
        parts.push({ text: currentPrompt });

        const config: Record<string, unknown> = {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              price_now: { type: Type.NUMBER, nullable: true },
              direction: { type: Type.STRING },
              confidence: { type: Type.INTEGER },
              support: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              resistance: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              target_price: { type: Type.NUMBER, nullable: true },
              stop_price: { type: Type.NUMBER, nullable: true },
              chart_reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
              news_impact: { type: Type.STRING },
              news_reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
              risks: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'direction',
              'confidence',
              'support',
              'resistance',
              'chart_reasons',
              'news_impact',
              'news_reasons',
              'risks',
            ],
          },
        };

        if (activeGeminiModel === 'gemini-4-hydrogen') {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }

        try {
          const response = await ai.models.generateContent({
            model: activeGeminiModel,
            contents: { parts },
            config,
          });

          const rawText = response.text ?? '';
          const parsed = tryParseForecast(rawText);
          if (parsed.success && parsed.result) {
            const check = validateForecastGuardrails(parsed.result, market, horizonHours);
            if (check.fatalErrors.length > 0 && attempt === 1) {
              lastError = check.fatalErrors.join(' ');
              currentPrompt = `${prompt}\n\n${buildRetryPrompt(lastError)}`;
              continue;
            }

            const finalWarnings = [
              ...(check.sanitized.guardrailWarnings ?? []),
              ...check.fatalErrors,
            ];
            return {
              ...check.sanitized,
              guardrailWarnings: finalWarnings.length > 0 ? finalWarnings : undefined,
              modelName: activeGeminiModel,
              requestedModel: selectedModel,
              fallbackNotice: isFallbackModel
                ? lang === 'en'
                  ? `Fallback to ${activeGeminiModel} (${selectedModel}: ${fallbackReason || 'temporarily unavailable'})`
                  : `Сработала резервная модель ${activeGeminiModel} (${selectedModel}: ${fallbackReason || 'временно недоступна'})`
                : undefined,
              providerName: 'Gemini API',
              responseTimeMs: Date.now() - startedAt,
              createdAtUtc: new Date().toISOString(),
            };
          }

          lastError = parsed.errorMessage ?? 'Invalid JSON';
          currentPrompt = `${prompt}\n\n${buildRetryPrompt(lastError)}`;
        } catch (err) {
          const rawErr = err instanceof Error ? err.message : String(err);
          lastGeminiErrMsg = rawErr;
          if (
            rawErr.includes('503') ||
            rawErr.includes('504') ||
            rawErr.includes('UNAVAILABLE') ||
            rawErr.includes('DEADLINE_EXCEEDED') ||
            rawErr.includes('high demand') ||
            rawErr.includes('429') ||
            rawErr.includes('404') ||
            rawErr.toLowerCase().includes('timeout') ||
            rawErr.toLowerCase().includes('deadline') ||
            rawErr.toLowerCase().includes('abort')
          ) {
            fallbackReason = rawErr.slice(0, 120);
            shouldFallbackModel = true;
            break;
          }
          throw err;
        }
      }

      if (!shouldFallbackModel) {
        lastGeminiErrMsg = `Не удалось разобрать ответ Gemini в JSON: ${lastError}`;
        break;
      }
    }

    throw new Error(
      lastGeminiErrMsg.includes('503') || lastGeminiErrMsg.includes('UNAVAILABLE')
        ? lang === 'en'
          ? 'Gemini servers are temporarily busy (HTTP 503). Please retry in a few seconds.'
          : 'Серверы Gemini временно перегружены (HTTP 503). Повторите попытку через пару секунд.'
        : lastGeminiErrMsg
    );
  }

  if (provider === AiProviderType.Claude) {
    const apiKey = String(claudeApiKey || process.env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error(
        lang === 'en' ? 'Claude API key is missing.' : 'Не указан ключ Claude API.'
      );
    }

    const modelName = model || DEFAULT_CLAUDE_MODEL;
    const contentParts: Array<Record<string, unknown>> = [];
    if (hasImage) {
      contentParts.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64Data,
        },
      });
    }
    contentParts.push({ type: 'text', text: prompt });

    const messages: Array<Record<string, unknown>> = [{ role: 'user', content: contentParts }];

    let lastError = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 1600,
          temperature: 0.1,
          messages,
        }),
        signal: AbortSignal.timeout(30000),
      });

      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(`Ошибка Claude API (${response.status}).`);
      }

      const jsonBody = JSON.parse(bodyText) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const rawText = (jsonBody.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('\n');

      const parsed = tryParseForecast(rawText);
      if (parsed.success && parsed.result) {
        const check = validateForecastGuardrails(parsed.result, market, horizonHours);
        if (check.fatalErrors.length > 0 && attempt === 1) {
          lastError = check.fatalErrors.join(' ');
          messages.push({ role: 'assistant', content: rawText });
          messages.push({ role: 'user', content: buildRetryPrompt(lastError) });
          continue;
        }
        const finalWarnings = [
          ...(check.sanitized.guardrailWarnings ?? []),
          ...check.fatalErrors,
        ];
        return {
          ...check.sanitized,
          guardrailWarnings: finalWarnings.length > 0 ? finalWarnings : undefined,
          modelName,
          requestedModel: modelName,
          providerName: 'Claude API',
          responseTimeMs: Date.now() - startedAt,
          createdAtUtc: new Date().toISOString(),
        };
      }

      lastError = parsed.errorMessage ?? 'Invalid JSON';
      if (attempt === 1) {
        messages.push({ role: 'assistant', content: rawText });
        messages.push({ role: 'user', content: buildRetryPrompt(lastError) });
      }
    }

    throw new Error(`Не удалось разобрать ответ Claude API в JSON: ${lastError}`);
  }

  // Ollama
  if (!model) {
    throw new Error('Не выбрана модель Ollama.');
  }

  const ollamaBase = normalizeOllamaUrl(ollamaUrl);
  const firstUserMsg: Record<string, unknown> = {
    role: 'user',
    content: prompt,
  };
  if (hasImage) {
    firstUserMsg.images = [base64Data];
  }

  const messages: Array<Record<string, unknown>> = [firstUserMsg];
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(`${ollamaBase}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        options: { temperature: 0.1 },
        messages,
      }),
      signal: AbortSignal.timeout(90000),
    });

    const responseBody = await response.text();
    if (!response.ok) {
      throw new Error(`Ollama вернул ошибку (${response.status}).`);
    }

    const parsedOllama = JSON.parse(responseBody) as { message?: { content?: string } };
    const rawText = parsedOllama?.message?.content ?? '';
    const parsed = tryParseForecast(rawText);

    if (parsed.success && parsed.result) {
      const check = validateForecastGuardrails(parsed.result, market, horizonHours);
      if (check.fatalErrors.length > 0 && attempt === 1) {
        lastError = check.fatalErrors.join(' ');
        messages.push({ role: 'assistant', content: rawText });
        messages.push({ role: 'user', content: buildRetryPrompt(lastError) });
        continue;
      }
      const finalWarnings = [
        ...(check.sanitized.guardrailWarnings ?? []),
        ...check.fatalErrors,
      ];
      return {
        ...check.sanitized,
        guardrailWarnings: finalWarnings.length > 0 ? finalWarnings : undefined,
        modelName: model,
        requestedModel: model,
        providerName: 'Ollama',
        responseTimeMs: Date.now() - startedAt,
        createdAtUtc: new Date().toISOString(),
      };
    }

    lastError = parsed.errorMessage ?? 'Invalid JSON';
    if (attempt === 1) {
      messages.push({ role: 'assistant', content: rawText });
      messages.push({ role: 'user', content: buildRetryPrompt(lastError) });
    }
  }

  throw new Error(`Не удалось разобрать ответ модели Ollama в JSON: ${lastError}`);
}

function evaluateTargetStopOutcome(
  entry: ForecastHistoryEntry,
  candles: OhlcCandle[],
  horizonFinished: boolean
): {
  outcomeStatus: ForecastOutcomeStatus;
  highDuringHorizon: number | null;
  lowDuringHorizon: number | null;
} {
  if (candles.length === 0) {
    return {
      outcomeStatus: horizonFinished ? 'expired' : 'pending',
      highDuringHorizon: null,
      lowDuringHorizon: null,
    };
  }

  const highDuringHorizon = Math.max(...candles.map((c) => c.high));
  const lowDuringHorizon = Math.min(...candles.map((c) => c.low));

  const target = entry.targetPrice;
  const stop = entry.stopPrice;

  if (entry.direction === ForecastDirection.Up) {
    for (const c of candles) {
      const hitStop = stop !== null && c.low <= stop;
      const hitTarget = target !== null && c.high >= target;
      // Conservative tie-breaker: if same 5m candle hits both, treat as stop_hit
      if (hitStop) return { outcomeStatus: 'stop_hit', highDuringHorizon, lowDuringHorizon };
      if (hitTarget) return { outcomeStatus: 'target_hit', highDuringHorizon, lowDuringHorizon };
    }
  } else if (entry.direction === ForecastDirection.Down) {
    for (const c of candles) {
      const hitStop = stop !== null && c.high >= stop;
      const hitTarget = target !== null && c.low <= target;
      if (hitStop) return { outcomeStatus: 'stop_hit', highDuringHorizon, lowDuringHorizon };
      if (hitTarget) return { outcomeStatus: 'target_hit', highDuringHorizon, lowDuringHorizon };
    }
  }

  return {
    outcomeStatus: horizonFinished ? 'expired' : 'pending',
    highDuringHorizon,
    lowDuringHorizon,
  };
}

async function maybeSendAlertsForForecast(
  result: ForecastResult,
  market: MarketSnapshot | null,
  reqBody: Record<string, unknown>,
  lang: 'ru' | 'en'
): Promise<void> {
  const botToken = String(reqBody?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(reqBody?.telegramChatId || process.env.TELEGRAM_CHAT_ID || '').trim();
  const webhookUrl = String(reqBody?.webhookUrl || process.env.ALERT_WEBHOOK_URL || '').trim();

  if (!((botToken && chatId) || webhookUrl)) return;

  const threshold = Number(reqBody?.notifyConfidenceThreshold ?? 70);
  const previousDirection = String(reqBody?.previousDirection ?? '');
  const notifyOnDirectionChange = reqBody?.notifyOnDirectionChange !== false;

  const directionChanged =
    Boolean(previousDirection) &&
    previousDirection !== ForecastDirection.Unknown &&
    previousDirection !== result.direction;
  const highConfidence = result.confidence >= threshold;
  const hasAnomalies = (market?.anomalies.length ?? 0) > 0;

  if (!(highConfidence || (notifyOnDirectionChange && directionChanged) || hasAnomalies)) {
    return;
  }

  const horizon = result.horizonHours ?? 4;
  const title = `Pearl AI Analyst — ${result.direction.toUpperCase()} (${result.confidence}%, ${horizon}h)`;
  const lines = [
    lang === 'en'
      ? `Price: ${result.priceNow ?? 'n/a'} | Target: ${result.targetPrice ?? 'n/a'} | Stop: ${result.stopPrice ?? 'n/a'}`
      : `Цена: ${result.priceNow ?? 'нет данных'} | Цель: ${result.targetPrice ?? 'нет данных'} | Стоп: ${result.stopPrice ?? 'нет данных'}`,
    `${lang === 'en' ? 'Model' : 'Модель'}: ${result.providerName} / ${result.modelName}`,
  ];
  if (market?.anomalies.length) {
    lines.push(`⚠️ ${market.anomalies.join(' | ')}`);
  }
  if (result.newsImpact) {
    lines.push(result.newsImpact);
  }

  await dispatchExternalAlerts({
    title,
    message: lines.join('\n'),
    telegramBotToken: botToken,
    telegramChatId: chatId,
    webhookUrl,
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // 1. Live PEARL/USDT Market Snapshot + Technical Indicators + Macro Context
  app.get('/api/market', async (req, res) => {
    try {
      const force = req.query.force === '1';
      const snapshot = await fetchPearlMarketSnapshot(force);
      res.json(snapshot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: msg });
    }
  });

  // 2. News fetching & News Radar scoring (score FIRST, guaranteed DirectPearl quota!)
  app.post('/api/news', async (req, res) => {
    try {
      const rssFeeds: string[] = Array.isArray(req.body?.rssFeeds) ? req.body.rssFeeds : [];
      const keywords: string[] = Array.isArray(req.body?.keywords) ? req.body.keywords : [];

      const uniqueFeeds = Array.from(
        new Set(rssFeeds.map((u) => String(u).trim()).filter(Boolean))
      );
      const uniqueKeywords = Array.from(
        new Set(keywords.map((k) => String(k).trim()).filter(Boolean))
      );

      const errors = new Set<string>();
      const tasks: Promise<NewsItem[]>[] = [];

      for (const feedUrl of uniqueFeeds) {
        tasks.push(fetchFeedSafe(feedUrl, 'RSS', errors));
      }

      for (const kw of uniqueKeywords) {
        const scopedQuery = buildCryptoNewsQuery(kw);
        if (!scopedQuery) continue;
        const encoded = encodeURIComponent(scopedQuery);
        const googleNewsUrl = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
        tasks.push(fetchFeedSafe(googleNewsUrl, kw, errors));
      }

      const batches = await Promise.all(tasks);
      const all = batches.flat().filter((item) => item.title.length > 0);

      // Deduplicate across all sources first without premature truncation
      const map = new Map<string, NewsItem>();
      for (const item of all) {
        const key = (item.link || item.title).trim().toLowerCase();
        const existing = map.get(key);
        const itemTime = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
        const existingTime = existing?.publishedAt ? new Date(existing.publishedAt).getTime() : 0;
        if (!existing || itemTime > existingTime) {
          map.set(key, item);
        }
      }

      const prioritized = prioritizeAndSelectNews(Array.from(map.values()), 40, 15);

      res.json({
        items: prioritized,
        errors: Array.from(errors),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ items: [], errors: [msg] });
    }
  });

  // 3. Gemini server status (never exposes key)
  app.get('/api/gemini/status', (req, res) => {
    const lang = req.query.lang === 'en' ? 'en' : 'ru';
    const hasKey = keyVault.hasGeminiKey();
    if (hasKey) {
      res.json({
        state: ServiceConnectionState.Connected,
        isConnected: true,
        statusMessage: lang === 'en' ? 'Gemini API: connected' : 'Gemini API: подключен',
        troubleshootingTooltip:
          lang === 'en'
            ? 'Server-side GEMINI_API_KEY is sealed in memory (AES-256-GCM) and ready via @google/genai.'
            : 'Серверный ключ GEMINI_API_KEY зашифрован в памяти сервера (AES-256-GCM) и готов к работе через @google/genai.',
      });
    } else {
      res.json({
        state: ServiceConnectionState.NotConfigured,
        isConnected: false,
        statusMessage: lang === 'en' ? 'Gemini API: not configured' : 'Gemini API: ключ не задан',
        troubleshootingTooltip:
          lang === 'en'
            ? 'GEMINI_API_KEY environment variable is not set on the server.'
            : 'Переменная окружения GEMINI_API_KEY не задана на сервере.',
      });
    }
  });

  // 4. Ollama status proxy
  app.post('/api/ollama/status', async (req, res) => {
    const lang = req.body?.lang === 'en' ? 'en' : 'ru';
    const baseUrl = normalizeOllamaUrl(req.body?.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
      if (!response.ok) {
        res.json({
          state: ServiceConnectionState.Error,
          isConnected: false,
          statusMessage:
            lang === 'en'
              ? `Ollama: error (${response.status})`
              : `Ollama: ошибка (${response.status})`,
          hintMessage:
            lang === 'en'
              ? 'Start Ollama (command: ollama serve) and ensure a vision model is pulled.'
              : 'Запустите Ollama (команда: ollama serve) и установите модель с поддержкой изображений.',
          troubleshootingTooltip:
            lang === 'en'
              ? `Ollama server (${baseUrl}) returned HTTP ${response.status}.`
              : `Сервер Ollama (${baseUrl}) вернул HTTP ${response.status}.`,
          installedModels: [],
        });
        return;
      }

      const data = (await response.json()) as { models?: Array<{ name?: string }> };
      const models = (data.models ?? [])
        .map((m) => m.name)
        .filter((n): n is string => Boolean(n && n.trim()));

      res.json({
        state:
          models.length > 0
            ? ServiceConnectionState.Connected
            : ServiceConnectionState.NotConfigured,
        isConnected: true,
        statusMessage:
          models.length > 0
            ? lang === 'en'
              ? `Ollama running • models: ${models.length}`
              : `Ollama запущен • моделей: ${models.length}`
            : lang === 'en'
            ? 'Ollama running • no models'
            : 'Ollama запущен • нет моделей',
        hintMessage:
          models.length === 0
            ? lang === 'en'
              ? 'Pull a vision model: ollama pull qwen2.5vl:32b (or qwen2.5vl:7b)'
              : 'Установите модель с поддержкой изображений: ollama pull qwen2.5vl:32b (или qwen2.5vl:7b)'
            : '',
        troubleshootingTooltip:
          models.length > 0
            ? lang === 'en'
              ? `Connected to ${baseUrl}. Models available: ${models.length}.`
              : `Подключено к ${baseUrl}. Доступно моделей: ${models.length}.`
            : lang === 'en'
            ? 'Ollama is running, but no models are installed.'
            : 'Сервер Ollama запущен, но модели не найдены.',
        installedModels: models,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({
        state: ServiceConnectionState.Error,
        isConnected: false,
        statusMessage: lang === 'en' ? 'Ollama offline' : 'Ollama не запущен',
        hintMessage:
          lang === 'en'
            ? 'Start Ollama (ollama serve) or configure a reachable Ollama server URL in Settings.'
            : 'Запустите Ollama (ollama serve) или укажите доступный URL сервера Ollama в настройках.',
        troubleshootingTooltip:
          lang === 'en'
            ? `Failed to connect to ${baseUrl} (${msg}).`
            : `Не удалось подключиться к ${baseUrl} (${msg}).`,
        installedModels: [],
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // 5. Claude status proxy
  app.post('/api/claude/status', async (req, res) => {
    const lang = req.body?.lang === 'en' ? 'en' : 'ru';
    const apiKey = String(req.body?.apiKey || process.env.ANTHROPIC_API_KEY || '').trim();

    if (!apiKey) {
      res.json({
        state: ServiceConnectionState.NotConfigured,
        isConnected: false,
        statusMessage: lang === 'en' ? 'Claude API: no API key' : 'Claude API: ключ не задан',
        troubleshootingTooltip:
          lang === 'en'
            ? 'Enter your Anthropic API key in Settings -> AI Provider & Model or set ANTHROPIC_API_KEY in .env.'
            : 'Укажите ключ Anthropic API в «Настройки» или в серверном файле .env (ANTHROPIC_API_KEY).',
      });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (response.ok) {
        res.json({
          state: ServiceConnectionState.Connected,
          isConnected: true,
          statusMessage: lang === 'en' ? 'Claude API: connected' : 'Claude API: подключен',
          troubleshootingTooltip:
            lang === 'en'
              ? 'Connected to api.anthropic.com; Claude API key is valid.'
              : 'Соединение с api.anthropic.com активно, ключ Claude API подтверждён.',
        });
        return;
      }

      if (response.status === 401 || response.status === 403) {
        res.json({
          state: ServiceConnectionState.Error,
          isConnected: false,
          statusMessage:
            lang === 'en'
              ? `Claude API: key error (${response.status})`
              : `Claude API: ошибка ключа (${response.status})`,
          troubleshootingTooltip:
            lang === 'en'
              ? 'Anthropic API rejected the key (HTTP 401/403).'
              : 'Сервер Anthropic отклонил ключ (HTTP 401/403).',
        });
        return;
      }

      res.json({
        state: ServiceConnectionState.Error,
        isConnected: false,
        statusMessage:
          lang === 'en'
            ? `Claude API: error (${response.status})`
            : `Claude API: ошибка (${response.status})`,
        troubleshootingTooltip: `HTTP ${response.status}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({
        state: ServiceConnectionState.Error,
        isConnected: false,
        statusMessage: lang === 'en' ? 'Claude API: unreachable' : 'Claude API: нет связи',
        troubleshootingTooltip: msg,
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // 6. Single-Provider Multimodal Analysis (+ technical indicators, feedback & SQLite persistence)
  app.post('/api/analyze', async (req, res) => {
    try {
      const rawProvider = String(req.body?.provider ?? AiProviderType.Gemini);
      if (
        rawProvider !== AiProviderType.Gemini &&
        rawProvider !== AiProviderType.Claude &&
        rawProvider !== AiProviderType.Ollama
      ) {
        res.status(400).json({ error: `Неподдерживаемый провайдер: ${rawProvider}` });
        return;
      }
      const provider: AiProviderType = rawProvider;
      const model: string = String(req.body?.model ?? '').trim();
      const imageInput: string = String(req.body?.imageBase64 ?? '').trim();
      const news: NewsItem[] = Array.isArray(req.body?.news) ? req.body.news : [];
      const lang: 'ru' | 'en' = req.body?.lang === 'en' ? 'en' : 'ru';
      const horizonHours = normalizeHorizonHours(req.body?.horizonHours);
      const providedMarket: MarketSnapshot | null = req.body?.marketSnapshot ?? null;

      let market = providedMarket;
      if (!market) {
        try {
          market = await fetchPearlMarketSnapshot(false);
        } catch {
          market = null;
        }
      }

      if (!imageInput && !market) {
        res.status(400).json({
          error:
            lang === 'en'
              ? 'Neither chart screenshot nor live market data is available.'
              : 'Не передан скриншот графика и не удалось загрузить живой рынок PEARL/USDT.',
        });
        return;
      }

      const recentHistory = forecastDb.getRecentFeedback(3);

      const result = await analyzeWithProvider({
        provider,
        model,
        imageInput,
        news,
        lang,
        horizonHours,
        recentHistory,
        market,
        claudeApiKey: req.body?.claudeApiKey,
        ollamaUrl: req.body?.ollamaUrl,
      });

      const fullResult: ForecastResult = {
        ...result,
        horizonHours,
        screenshotDataUrl: imageInput || undefined,
        marketSnapshot: market,
      };

      const historyEntry = forecastDb.insertForecast(
        fullResult,
        news,
        market?.priceUsd ?? fullResult.priceNow ?? null,
        horizonHours,
        market?.technicalIndicators?.atrPercent ?? null
      );

      void maybeSendAlertsForForecast(fullResult, market, req.body ?? {}, lang);

      res.json({
        ...fullResult,
        historyEntry,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 7. Multi-Model AI Council (Historical-Accuracy Weighted Consensus Analysis)
  app.post('/api/analyze/consensus', async (req, res) => {
    try {
      const imageInput: string = String(req.body?.imageBase64 ?? '').trim();
      const news: NewsItem[] = Array.isArray(req.body?.news) ? req.body.news : [];
      const lang: 'ru' | 'en' = req.body?.lang === 'en' ? 'en' : 'ru';
      const horizonHours = normalizeHorizonHours(req.body?.horizonHours);
      const geminiModel = String(req.body?.geminiModel ?? DEFAULT_GEMINI_MODEL).trim();
      const claudeModel = String(req.body?.claudeModel ?? DEFAULT_CLAUDE_MODEL).trim();
      const claudeApiKey = String(req.body?.claudeApiKey || process.env.ANTHROPIC_API_KEY || '').trim();
      const ollamaUrl = normalizeOllamaUrl(req.body?.ollamaUrl);
      const ollamaModel = String(req.body?.ollamaModel ?? '').trim();

      let market: MarketSnapshot | null = req.body?.marketSnapshot ?? null;
      if (!market) {
        try {
          market = await fetchPearlMarketSnapshot(false);
        } catch {
          market = null;
        }
      }

      if (!imageInput && !market) {
        res.status(400).json({
          error:
            lang === 'en'
              ? 'Neither chart screenshot nor live market data is available.'
              : 'Не передан скриншот графика и не удалось загрузить живой рынок PEARL/USDT.',
        });
        return;
      }

      const candidates: Array<{ provider: AiProviderType; model: string }> = [];
      if (keyVault.hasGeminiKey()) {
        candidates.push({ provider: AiProviderType.Gemini, model: geminiModel });
      }
      if (claudeApiKey) {
        candidates.push({ provider: AiProviderType.Claude, model: claudeModel });
      }

      if (ollamaModel) {
        try {
          const ctrl = new AbortController();
          const tmr = setTimeout(() => ctrl.abort(), 1800);
          const ping = await fetch(`${ollamaUrl}/api/tags`, { signal: ctrl.signal });
          clearTimeout(tmr);
          if (ping.ok) {
            candidates.push({ provider: AiProviderType.Ollama, model: ollamaModel });
          }
        } catch {
          // Ollama offline — skip silently
        }
      }

      if (candidates.length === 0) {
        res.status(400).json({
          error:
            lang === 'en'
              ? 'No configured AI providers are available for consensus.'
              : 'Нет доступных настроенных ИИ-провайдеров для консенсуса.',
        });
        return;
      }

      const recentHistory = forecastDb.getRecentFeedback(3);
      const historicalWinRates = forecastDb.getModelHistoricalWinRates();

      const startedAll = Date.now();
      const settled = await Promise.all(
        candidates.map(async (c): Promise<{ vote: ModelVote; full?: ForecastResult }> => {
          const started = Date.now();
          try {
            const out = await analyzeWithProvider({
              provider: c.provider,
              model: c.model,
              imageInput,
              news,
              lang,
              horizonHours,
              recentHistory,
              market,
              claudeApiKey,
              ollamaUrl,
            });
            const hist = historicalWinRates.get(out.modelName.toLowerCase());
            const multiplier =
              hist && hist.sampleSize >= 5 ? Number((0.5 + hist.winRate / 100).toFixed(2)) : 1;
            const weight = Number((Math.max(1, out.confidence) * multiplier).toFixed(1));
            return {
              vote: {
                provider: out.providerName,
                model: out.modelName,
                direction: out.direction,
                confidence: out.confidence,
                weight,
                historicalWinRate: hist && hist.sampleSize >= 5 ? hist.winRate : null,
                priceNow: out.priceNow,
                targetPrice: out.targetPrice,
                stopPrice: out.stopPrice,
                responseTimeMs: out.responseTimeMs,
              },
              full: out,
            };
          } catch (err) {
            return {
              vote: {
                provider: c.provider,
                model: c.model,
                direction: ForecastDirection.Unknown,
                confidence: 0,
                weight: 0,
                historicalWinRate: null,
                priceNow: null,
                targetPrice: null,
                stopPrice: null,
                responseTimeMs: Date.now() - started,
                error: err instanceof Error ? err.message : String(err),
              },
            };
          }
        })
      );

      const succeeded = settled.filter((s) => Boolean(s.full));
      if (succeeded.length === 0) {
        const errors = settled.map((s) => `${s.vote.provider}: ${s.vote.error}`).join('; ');
        res.status(502).json({ error: errors || 'All providers failed.' });
        return;
      }

      // Compute historical-accuracy weighted consensus direction
      const scoreByDir = new Map<ForecastDirection, number>();
      for (const s of succeeded) {
        const dir = s.full!.direction;
        const w = s.vote.weight ?? Math.max(1, s.full!.confidence);
        scoreByDir.set(dir, (scoreByDir.get(dir) ?? 0) + w);
      }

      let winningDir = succeeded[0].full!.direction;
      let topScore = -1;
      for (const [dir, score] of scoreByDir.entries()) {
        if (score > topScore) {
          topScore = score;
          winningDir = dir;
        }
      }

      const aligned = succeeded.filter((s) => s.full!.direction === winningDir);
      const agreementPercent = Math.round((aligned.length / succeeded.length) * 100);
      const hasDisagreement = aligned.length < succeeded.length;

      const avgConfidence = Math.round(
        aligned.reduce((acc, s) => acc + s.full!.confidence, 0) / aligned.length
      );

      const weightedAvgNullable = (
        items: Array<{ val: number | null; weight: number }>
      ): number | null => {
        const valid = items.filter((i) => i.val !== null && Number.isFinite(i.val));
        if (valid.length === 0) return null;
        const totalW = valid.reduce((a, b) => a + Math.max(1, b.weight), 0);
        const sum = valid.reduce((a, b) => a + b.val! * Math.max(1, b.weight), 0);
        return Number((sum / totalW).toFixed(8));
      };

      const primary = aligned.sort((a, b) => (b.vote.weight ?? 0) - (a.vote.weight ?? 0))[0].full!;
      const consensus: ConsensusSummary = {
        totalQueried: candidates.length,
        totalSucceeded: succeeded.length,
        agreementPercent,
        hasDisagreement,
        votes: settled.map((s) => s.vote),
      };

      const fallbackNotices = succeeded
        .map((s) => s.full?.fallbackNotice)
        .filter((n): n is string => Boolean(n));

      const mergedResult: ForecastResult = {
        ...primary,
        direction: winningDir,
        horizonHours,
        confidence: hasDisagreement ? Math.max(25, Math.round(avgConfidence * 0.88)) : avgConfidence,
        priceNow:
          weightedAvgNullable(
            succeeded.map((s) => ({ val: s.full!.priceNow, weight: s.vote.weight ?? 1 }))
          ) ??
          market?.priceUsd ??
          null,
        targetPrice: weightedAvgNullable(
          aligned.map((s) => ({ val: s.full!.targetPrice, weight: s.vote.weight ?? 1 }))
        ),
        stopPrice: weightedAvgNullable(
          aligned.map((s) => ({ val: s.full!.stopPrice, weight: s.vote.weight ?? 1 }))
        ),
        fallbackNotice: fallbackNotices.length > 0 ? fallbackNotices.join(' | ') : undefined,
        providerName:
          succeeded.length > 1 ? `Council (${succeeded.length})` : primary.providerName,
        modelName: succeeded.map((s) => s.full!.modelName).join(' + '),
        responseTimeMs: Date.now() - startedAll,
        createdAtUtc: new Date().toISOString(),
        screenshotDataUrl: imageInput || undefined,
        marketSnapshot: market,
        consensus,
      };

      const historyEntry = forecastDb.insertForecast(
        mergedResult,
        news,
        market?.priceUsd ?? mergedResult.priceNow ?? null,
        horizonHours,
        market?.technicalIndicators?.atrPercent ?? null
      );

      void maybeSendAlertsForForecast(mergedResult, market, req.body ?? {}, lang);

      res.json({
        ...mergedResult,
        historyEntry,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 8. Persistent SQLite Forecast History + Audit + High/Low Target-vs-Stop Market Verification
  app.get('/api/history', (_req, res) => {
    try {
      const entries = forecastDb.getAll();
      res.json({ entries });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ entries: [], error: msg });
    }
  });

  app.delete('/api/history/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid forecast ID' });
      return;
    }
    const deleted = forecastDb.deleteForecast(id);
    res.json({ deleted });
  });

  app.post('/api/history/verify', async (_req, res) => {
    try {
      const entries = forecastDb.getAll();
      const nowMs = Date.now();
      let updatedCount = 0;

      const candidates = entries
        .filter((e) => {
          const ageMs = nowMs - new Date(e.createdAtUtc).getTime();
          const needs1h = ageMs >= 3600_000 && e.actualPrice1h === null;
          const needs2h = ageMs >= 2 * 3600_000 && e.actualPrice2h === null;
          const needs4h = ageMs >= 4 * 3600_000 && e.actualPrice4h === null;
          const needsOutcome =
            ageMs >= 15 * 60_000 && (!e.outcomeStatus || e.outcomeStatus === 'pending');
          return needs1h || needs2h || needs4h || needsOutcome;
        })
        .slice(0, 12);

      for (const entry of candidates) {
        const createdMs = new Date(entry.createdAtUtc).getTime();
        const horizonHrs = entry.horizonHours && entry.horizonHours > 0 ? entry.horizonHours : 4;
        const horizonEndMs = createdMs + horizonHrs * 3600_000;
        const horizonFinished = nowMs >= horizonEndMs;

        const updates: {
          h1?: number | null;
          h2?: number | null;
          h4?: number | null;
          outcomeStatus?: ForecastOutcomeStatus | null;
          highDuringHorizon?: number | null;
          lowDuringHorizon?: number | null;
        } = {};

        // Fetch 5m candles from forecast creation up to min(now, max(4h, horizon)) for fast, accurate check
        const maxWindowEnd = Math.min(nowMs, createdMs + Math.max(4, horizonHrs) * 3600_000 + 15 * 60_000);
        const rangeCandles = await fetchPearlCandlesInRange(createdMs, maxWindowEnd);

        const pickCandleCloseNear = (targetMs: number): number | null => {
          let best: OhlcCandle | null = null;
          let bestDiff = 25 * 60_000;
          for (const c of rangeCandles) {
            const diff = Math.abs(c.timestamp - targetMs);
            if (diff < bestDiff && c.close > 0) {
              bestDiff = diff;
              best = c;
            }
          }
          return best ? best.close : null;
        };

        if (nowMs - createdMs >= 3600_000 && entry.actualPrice1h === null) {
          const p1 =
            pickCandleCloseNear(createdMs + 3600_000) ??
            (await fetchPearlPriceNearTime(createdMs + 3600_000));
          if (p1 !== null) updates.h1 = p1;
        }
        if (nowMs - createdMs >= 2 * 3600_000 && entry.actualPrice2h === null) {
          const p2 =
            pickCandleCloseNear(createdMs + 2 * 3600_000) ??
            (await fetchPearlPriceNearTime(createdMs + 2 * 3600_000));
          if (p2 !== null) updates.h2 = p2;
        }
        if (nowMs - createdMs >= 4 * 3600_000 && entry.actualPrice4h === null) {
          const p4 =
            pickCandleCloseNear(createdMs + 4 * 3600_000) ??
            (await fetchPearlPriceNearTime(createdMs + 4 * 3600_000));
          if (p4 !== null) updates.h4 = p4;
        }

        if (!entry.outcomeStatus || entry.outcomeStatus === 'pending') {
          const horizonCandles = rangeCandles.filter(
            (c) => c.timestamp >= createdMs && c.timestamp <= horizonEndMs
          );
          if (horizonCandles.length > 0 || horizonFinished) {
            const outcome = evaluateTargetStopOutcome(entry, horizonCandles, horizonFinished);
            if (outcome.outcomeStatus !== entry.outcomeStatus) {
              updates.outcomeStatus = outcome.outcomeStatus;
            }
            if (outcome.highDuringHorizon !== null) {
              updates.highDuringHorizon = outcome.highDuringHorizon;
            }
            if (outcome.lowDuringHorizon !== null) {
              updates.lowDuringHorizon = outcome.lowDuringHorizon;
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          forecastDb.updateActualPrices(entry.id, updates);
          updatedCount++;
        }
      }

      res.json({
        updatedCount,
        entries: forecastDb.getAll(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // 9. Telegram / Webhook Test Endpoint
  app.post('/api/alerts/test', async (req, res) => {
    try {
      const lang = req.body?.lang === 'en' ? 'en' : 'ru';
      const result = await dispatchExternalAlerts({
        title: 'Pearl AI Analyst — Test Alert',
        message:
          lang === 'en'
            ? 'Connection verified! Telegram / Webhook alerts are active for PEARL/USDT.'
            : 'Проверка связи успешна! Уведомления Telegram / Webhook активны для PEARL/USDT.',
        telegramBotToken: String(req.body?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || ''),
        telegramChatId: String(req.body?.telegramChatId || process.env.TELEGRAM_CHAT_ID || ''),
        webhookUrl: String(req.body?.webhookUrl || process.env.ALERT_WEBHOOK_URL || ''),
      });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ telegramSent: false, webhookSent: false, errors: [msg] });
    }
  });

  // 10. GitHub release check
  app.get('/api/updates', async (_req, res) => {
    const parseVersion = (v: string): number[] =>
      v
        .replace(/^v/i, '')
        .split('.')
        .map((part) => parseInt(part, 10) || 0);
    const isNewer = (latest: string, current: string): boolean => {
      const l = parseVersion(latest);
      const c = parseVersion(current);
      for (let i = 0; i < Math.max(l.length, c.length); i++) {
        const diff = (l[i] ?? 0) - (c[i] ?? 0);
        if (diff !== 0) return diff > 0;
      }
      return false;
    };

    try {
      const response = await fetch(
        'https://api.github.com/repos/vovik06302-ai/analitik/releases/latest',
        {
          headers: {
            'User-Agent': 'PearlAiAnalyst',
            Accept: 'application/vnd.github+json',
          },
          signal: AbortSignal.timeout(7000),
        }
      );

      if (!response.ok) {
        res.json({
          status: 'error',
          currentVersion: APP_VERSION,
          message: `Не удалось проверить обновления: GitHub ответил ${response.status}.`,
        });
        return;
      }

      const data = (await response.json()) as {
        tag_name?: string;
        html_url?: string;
        assets?: Array<{ name?: string; browser_download_url?: string }>;
      };
      const latestTag = (data.tag_name ?? '').replace(/^v/i, '');

      if (latestTag && isNewer(latestTag, APP_VERSION)) {
        const installer = (data.assets ?? []).find((asset) =>
          /setup.*\.exe$/i.test(asset.name ?? '')
        );
        res.json({
          status: 'update_available',
          currentVersion: APP_VERSION,
          latestVersion: latestTag,
          releaseUrl: data.html_url ?? '',
          downloadUrl: installer?.browser_download_url ?? '',
          message: installer
            ? `Доступна новая версия v${latestTag} (у вас v${APP_VERSION}).`
            : `Вышла версия v${latestTag}, но установщик ещё загружается. Попробуйте через несколько минут.`,
        });
      } else {
        res.json({
          status: 'up_to_date',
          currentVersion: APP_VERSION,
          message: `У вас последняя версия v${APP_VERSION}.`,
        });
      }
    } catch {
      res.json({
        status: 'error',
        currentVersion: APP_VERSION,
        message: 'Не удалось проверить обновления: GitHub недоступен.',
      });
    }
  });

  // Vite middleware in dev, static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = process.env.DIST_DIR
      ? path.resolve(process.env.DIST_DIR)
      : path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Pearl AI Analyst server running on http://${HOST}:${PORT}`);
  });
}

startServer();
