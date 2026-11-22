import {
  ForecastDirection,
  ForecastHistoryEntry,
  ForecastHorizonHours,
  ForecastResult,
  MarketSnapshot,
  NewsItem,
  OhlcCandle,
} from '../src/types';

export interface ForecastParseOutcome {
  success: boolean;
  result?: Omit<ForecastResult, 'modelName' | 'providerName' | 'responseTimeMs' | 'createdAtUtc'>;
  errorMessage?: string;
}

export interface GuardrailValidationOutcome {
  fatalErrors: string[];
  warnings: string[];
  sanitized: Omit<ForecastResult, 'modelName' | 'providerName' | 'responseTimeMs' | 'createdAtUtc'>;
  riskRewardRatio: number | null;
}

function formatCandles(candles: OhlcCandle[], count: number): string {
  return candles
    .slice(-count)
    .map((c) => {
      const vol = c.volume !== undefined ? ` V:${Math.round(c.volume)}` : '';
      return `[${new Date(c.timestamp).toISOString().slice(5, 16).replace('T', ' ')} O:${c.open} H:${c.high} L:${c.low} C:${c.close}${vol}]`;
    })
    .join(' ');
}

function bidSharePercent(market: MarketSnapshot): number | null {
  const book = market.orderBook;
  if (!book) return null;
  const total = book.bidVolume + book.askVolume;
  return total > 0 ? (book.bidVolume / total) * 100 : null;
}

function selectNewsForPrompt(news: NewsItem[], limit = 12): NewsItem[] {
  const direct = news.filter((n) => n.relevance === 'DirectPearl');
  const market = news.filter((n) => n.relevance !== 'DirectPearl');
  const pickedDirect = direct.slice(0, Math.min(direct.length, 7));
  const pickedMarket = market.slice(0, Math.max(0, limit - pickedDirect.length));
  return [...pickedDirect, ...pickedMarket];
}

function formatRecentFeedback(
  recentHistory: ForecastHistoryEntry[] | undefined,
  lang: 'ru' | 'en'
): string[] {
  if (!recentHistory || recentHistory.length === 0) return [];
  const lines: string[] = [];
  lines.push('');
  lines.push(
    lang === 'en'
      ? 'Recent forecast feedback (for self-calibration, avoid erratic flip-flopping):'
      : 'Контекст последних прогнозов (для калибровки, избегай хаотичной смены направления без веских причин):'
  );
  for (const h of recentHistory.slice(0, 3)) {
    const base = h.marketPriceAtForecast ?? h.priceNow;
    const fact = h.actualPrice4h ?? h.actualPrice2h ?? h.actualPrice1h;
    const outcome = h.outcomeStatus ?? (fact ? 'evaluated' : 'pending');
    lines.push(
      `- [${h.createdAtUtc.slice(5, 16).replace('T', ' ')} UTC] ${h.direction} (${h.confidence}%, ${h.horizonHours ?? 4}h) | start=${base ?? 'n/a'} target=${h.targetPrice ?? 'n/a'} stop=${h.stopPrice ?? 'n/a'} | fact=${fact ?? 'pending'} (${outcome})`
    );
  }
  return lines;
}

export function buildAnalysisPrompt(
  news: NewsItem[],
  lang: 'ru' | 'en' = 'ru',
  market?: MarketSnapshot | null,
  hasImage = true,
  horizonHours: ForecastHorizonHours = 4,
  recentHistory?: ForecastHistoryEntry[]
): string {
  const lines: string[] = [];
  const prioritizedNews = selectNewsForPrompt(news, 12);

  if (lang === 'en') {
    lines.push('You are a quantitative cryptocurrency technical and news market analyst.');
    lines.push(`EXPLICIT FORECAST HORIZON: next ${horizonHours} hour(s). All direction, target_price, and stop_price predictions MUST be calibrated for this ${horizonHours}h window.`);
    if (hasImage) {
      lines.push('The attached screenshot shows the PEARL/USDT trading chart.');
      lines.push(
        'Your task: combine visual chart structure with the deterministic technical indicators, order book, trade flow, BTC/ETH macro context, and news below. Return strictly valid JSON with no extra text outside JSON.'
      );
      lines.push('');
      lines.push('CRITICAL RULES:');
      lines.push(
        '1. If numbers on the price axis in the screenshot are unreadable AND live market telemetry is unavailable — output null for missing numeric fields and [] for support/resistance. NEVER invent numbers.'
      );
    } else {
      lines.push('No chart screenshot is attached. Analyze PEARL/USDT using ONLY the live market telemetry, calculated indicators, candles, and real news items below.');
      lines.push('Return strictly valid JSON with no extra text outside JSON. NEVER invent prices not supported by the live telemetry.');
      lines.push('');
      lines.push('CRITICAL RULES:');
    }
    lines.push(
      '2. Logical price invariants: for "up", target_price MUST be strictly > price_now and stop_price strictly < price_now. For "down", target_price MUST be strictly < price_now and stop_price strictly > price_now. Support levels MUST be < price_now; resistance levels MUST be > price_now.'
    );
    lines.push(
      `3. Scale target_price and stop_price realistically using ATR(14) for a ${horizonHours}h horizon (avoid absurd targets > 8x ATR or stops tighter than 0.3x ATR).`
    );

    if (market) {
      lines.push('');
      lines.push(
        `Live Market Telemetry (${market.symbol} | Primary: ${market.primaryExchange} | Candles: ${market.candlesSource ?? market.primaryExchange}):`
      );
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
        lines.push(`- Bid/Ask Spread: ${market.spreadPercent.toFixed(3)}%`);
      }
      if (market.tickers.length > 1) {
        const cross = market.tickers
          .slice(0, 5)
          .map((t) => `${t.exchange}: ${t.lastPrice}`)
          .join(', ');
        lines.push(`- Cross-Exchange Prices: ${cross}`);
      }
      if (market.anomalies.length > 0) {
        lines.push(`- Detected Anomalies: ${market.anomalies.join('; ')}`);
      }

      const ti = market.technicalIndicators;
      if (ti) {
        lines.push('');
        lines.push('Deterministic Technical Indicators (pre-calculated on server):');
        lines.push(
          `- Trend EMAs: EMA9=${ti.ema9 ?? 'n/a'}, EMA21=${ti.ema21 ?? 'n/a'}, EMA50=${ti.ema50 ?? 'n/a'}, EMA200=${ti.ema200 ?? 'n/a'}, VWAP=${ti.vwap ?? 'n/a'}`
        );
        lines.push(
          `- Momentum: RSI(14)=${ti.rsi14 ?? 'n/a'} (divergence: ${ti.rsiDivergence}), MACD line=${ti.macd.line ?? 'n/a'} / signal=${ti.macd.signal ?? 'n/a'} / hist=${ti.macd.histogram ?? 'n/a'}`
        );
        lines.push(
          `- Volatility: ATR(14)=${ti.atr14 ?? 'n/a'} (${ti.atrPercent ?? 'n/a'}%), Bollinger=[${ti.bollinger.lower ?? 'n/a'} .. ${ti.bollinger.middle ?? 'n/a'} .. ${ti.bollinger.upper ?? 'n/a'}] bw=${ti.bollinger.bandwidthPercent ?? 'n/a'}% squeeze=${ti.bollinger.squeeze}`
        );
        lines.push(
          `- Structure & Levels: ${ti.structure}, Volume Ratio vs SMA20=${ti.volumeRatio ?? 'n/a'}x, Volume Profile POC=${ti.pocPrice ?? 'n/a'}, 7d Range=[${ti.low7d ?? 'n/a'} .. ${ti.high7d ?? 'n/a'}]`
        );
        if (ti.swingLows.length > 0 || ti.swingHighs.length > 0) {
          lines.push(
            `- Swing Lows: [${ti.swingLows.join(', ')}] | Swing Highs: [${ti.swingHighs.join(', ')}]`
          );
        }
        if (ti.multiTimeframe.length > 0) {
          const mtf = ti.multiTimeframe
            .map((tf) => `${tf.timeframe}:${tf.trend}(RSI ${tf.rsi14 ?? '-'})`)
            .join(' | ');
          lines.push(`- Multi-Timeframe Alignment: ${mtf}`);
        }
      }

      if (market.orderBook) {
        const share = bidSharePercent(market);
        const bandsStr = market.orderBook.bands?.length
          ? market.orderBook.bands
              .map((b) => `±${b.rangePercent}%: bids ${b.bidSharePercent}% ($${b.bidVolume} vs $${b.askVolume})`)
              .join(' | ')
          : '';
        lines.push(
          `- Order Book: top20 bidVol=${Math.round(market.orderBook.bidVolume)} askVol=${Math.round(market.orderBook.askVolume)}${share !== null ? ` (${share.toFixed(0)}% bids)` : ''}${bandsStr ? ` | Bands: ${bandsStr}` : ''}`
        );
        if (market.orderBook.largestBidWall || market.orderBook.largestAskWall) {
          const bw = market.orderBook.largestBidWall;
          const aw = market.orderBook.largestAskWall;
          lines.push(
            `- Order Book Walls: Bid wall ${bw ? `${bw.price} ($${bw.valueUsd}, -${bw.distancePercent}%)` : 'n/a'} | Ask wall ${aw ? `${aw.price} ($${aw.valueUsd}, +${aw.distancePercent}%)` : 'n/a'}`
          );
        }
      }

      if (market.tradeFlow) {
        lines.push(
          `- Recent Trade Flow (last ${market.tradeFlow.totalTrades} trades / ~${market.tradeFlow.windowMinutes}m): Buy $${market.tradeFlow.buyVolume} vs Sell $${market.tradeFlow.sellVolume} | CVD=$${market.tradeFlow.cvd} (${market.tradeFlow.buySharePercent}% buyer-initiated)`
        );
      }

      if (market.macroContext && (market.macroContext.btc || market.macroContext.eth)) {
        const parts: string[] = [];
        if (market.macroContext.btc) {
          const b = market.macroContext.btc;
          parts.push(
            `BTC $${b.priceUsd} (1h: ${b.change1hPercent ?? 'n/a'}%, 4h: ${b.change4hPercent ?? 'n/a'}%, 24h: ${b.change24hPercent ?? 'n/a'}%, 1h trend: ${b.trend1h})`
          );
        }
        if (market.macroContext.eth) {
          const e = market.macroContext.eth;
          parts.push(
            `ETH $${e.priceUsd} (1h: ${e.change1hPercent ?? 'n/a'}%, 4h: ${e.change4hPercent ?? 'n/a'}%, 24h: ${e.change24hPercent ?? 'n/a'}%, 1h trend: ${e.trend1h})`
          );
        }
        lines.push(`- Macro Crypto Context: ${parts.join(' | ')}`);
      }

      if (market.ohlc.length > 0) {
        const period = market.ohlcPeriodMinutes ?? 30;
        const count = market.ohlcPeriodMinutes === 15 ? 24 : 16;
        lines.push(`- Recent ${period}m OHLC candles (UTC, oldest first): ${formatCandles(market.ohlc, count)}`);
      }
      if (market.hourlyOhlc && market.hourlyOhlc.length > 0) {
        lines.push(`- Hourly OHLC candles (last 18h, UTC): ${formatCandles(market.hourlyOhlc, 18)}`);
      }
    }

    lines.push(...formatRecentFeedback(recentHistory, 'en'));

    lines.push('');
    lines.push('Latest prioritized news (Direct PEARL first):');
    if (prioritizedNews.length === 0) {
      lines.push('- No news found for the configured keywords.');
    } else {
      for (const item of prioritizedNews) {
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
    lines.push('Ты — количественный технический и новостной аналитик криптовалютного рынка.');
    lines.push(`ЯВНЫЙ ГОРИЗОНТ ПРОГНОЗА: ближайшие ${horizonHours} ч. Направление, target_price и stop_price должны быть откалиброваны именно под горизонт ${horizonHours} ч.`);
    if (hasImage) {
      lines.push('На прикреплённом скриншоте показан график пары PEARL/USDT.');
      lines.push(
        'Твоя задача: совместить визуальный анализ графика с расчётными техническими индикаторами, стаканом, лентой сделок, макро-контекстом BTC/ETH и новостями ниже. Верни строго валидный JSON без пояснений вне JSON.'
      );
      lines.push('');
      lines.push('КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА:');
      lines.push(
        '1. Если цифры на шкале цен на скриншоте не читаются И живых рыночных данных недостаточно — пиши null для неизвестных числовых полей и пустой массив [] для support/resistance. НИКОГДА не выдумывай числа!'
      );
    } else {
      lines.push('Скриншот графика не прикреплён — проведи анализ PEARL/USDT ТОЛЬКО на основе живой рыночной телеметрии, расчётных индикаторов, свечей и новостей ниже.');
      lines.push('Верни строго валидный JSON без пояснений вне JSON. НИКОГДА не выдумывай цены, которых нет в данных.');
      lines.push('');
      lines.push('КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА:');
    }
    lines.push(
      '2. Математическая непротиворечивость уровней: для "up" строго target_price > price_now и stop_price < price_now; для "down" строго target_price < price_now и stop_price > price_now. Все уровни support должны быть ниже price_now, а resistance — выше price_now.'
    );
    lines.push(
      `3. Соизмеряй target_price и stop_price с волатильностью ATR(14) для горизонта ${horizonHours} ч (не ставь нереалистичную цель дальше 8×ATR и стоп ближе 0.3×ATR).`
    );

    if (market) {
      lines.push('');
      lines.push(
        `Живая рыночная телеметрия (${market.symbol} | Биржа: ${market.primaryExchange} | Свечи: ${market.candlesSource ?? market.primaryExchange}):`
      );
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
        lines.push(`- Спред Bid/Ask: ${market.spreadPercent.toFixed(3)}%`);
      }
      if (market.tickers.length > 1) {
        const cross = market.tickers
          .slice(0, 5)
          .map((t) => `${t.exchange}: ${t.lastPrice}`)
          .join(', ');
        lines.push(`- Сверка цен по биржам: ${cross}`);
      }
      if (market.anomalies.length > 0) {
        lines.push(`- Зафиксированные аномалии: ${market.anomalies.join('; ')}`);
      }

      const ti = market.technicalIndicators;
      if (ti) {
        lines.push('');
        lines.push('Расчётные технические индикаторы (вычислены на сервере):');
        lines.push(
          `- Скользящие и VWAP: EMA9=${ti.ema9 ?? 'нет'}, EMA21=${ti.ema21 ?? 'нет'}, EMA50=${ti.ema50 ?? 'нет'}, EMA200=${ti.ema200 ?? 'нет'}, VWAP=${ti.vwap ?? 'нет'}`
        );
        lines.push(
          `- Импульс: RSI(14)=${ti.rsi14 ?? 'нет'} (дивергенция: ${ti.rsiDivergence}), MACD line=${ti.macd.line ?? 'нет'} / signal=${ti.macd.signal ?? 'нет'} / hist=${ti.macd.histogram ?? 'нет'}`
        );
        lines.push(
          `- Волатильность: ATR(14)=${ti.atr14 ?? 'нет'} (${ti.atrPercent ?? 'нет'}%), Боллинджер=[${ti.bollinger.lower ?? 'нет'} .. ${ti.bollinger.middle ?? 'нет'} .. ${ti.bollinger.upper ?? 'нет'}] ширина=${ti.bollinger.bandwidthPercent ?? 'нет'}% сжатие=${ti.bollinger.squeeze ? 'да' : 'нет'}`
        );
        lines.push(
          `- Структура и объём: ${ti.structure}, объём к SMA20=${ti.volumeRatio ?? 'нет'}×, POC (макс. объём)=${ti.pocPrice ?? 'нет'}, диапазон 7д=[${ti.low7d ?? 'нет'} .. ${ti.high7d ?? 'нет'}]`
        );
        if (ti.swingLows.length > 0 || ti.swingHighs.length > 0) {
          lines.push(
            `- Локальные минимумы (Swing Lows): [${ti.swingLows.join(', ')}] | Максимумы (Swing Highs): [${ti.swingHighs.join(', ')}]`
          );
        }
        if (ti.multiTimeframe.length > 0) {
          const mtf = ti.multiTimeframe
            .map((tf) => `${tf.timeframe}:${tf.trend}(RSI ${tf.rsi14 ?? '-'})`)
            .join(' | ');
          lines.push(`- Согласованность таймфреймов: ${mtf}`);
        }
      }

      if (market.orderBook) {
        const share = bidSharePercent(market);
        const bandsStr = market.orderBook.bands?.length
          ? market.orderBook.bands
              .map((b) => `±${b.rangePercent}%: биды ${b.bidSharePercent}% ($${b.bidVolume} против $${b.askVolume})`)
              .join(' | ')
          : '';
        lines.push(
          `- Стакан заявок: топ-20 биды ${Math.round(market.orderBook.bidVolume)} против аски ${Math.round(market.orderBook.askVolume)}${share !== null ? ` (доля покупок ${share.toFixed(0)}%)` : ''}${bandsStr ? ` | Коридоры: ${bandsStr}` : ''}`
        );
        if (market.orderBook.largestBidWall || market.orderBook.largestAskWall) {
          const bw = market.orderBook.largestBidWall;
          const aw = market.orderBook.largestAskWall;
          lines.push(
            `- Крупные стенки стакана: Bid ${bw ? `${bw.price} ($${bw.valueUsd}, -${bw.distancePercent}%)` : 'нет'} | Ask ${aw ? `${aw.price} ($${aw.valueUsd}, +${aw.distancePercent}%)` : 'нет'}`
          );
        }
      }

      if (market.tradeFlow) {
        lines.push(
          `- Лента сделок (последние ${market.tradeFlow.totalTrades} сделок / ~${market.tradeFlow.windowMinutes} мин): Покупки $${market.tradeFlow.buyVolume} против Продаж $${market.tradeFlow.sellVolume} | CVD=$${market.tradeFlow.cvd} (доля рыночных покупок ${market.tradeFlow.buySharePercent}%)`
        );
      }

      if (market.macroContext && (market.macroContext.btc || market.macroContext.eth)) {
        const parts: string[] = [];
        if (market.macroContext.btc) {
          const b = market.macroContext.btc;
          parts.push(
            `BTC $${b.priceUsd} (1ч: ${b.change1hPercent ?? 'нет'}%, 4ч: ${b.change4hPercent ?? 'нет'}%, 24ч: ${b.change24hPercent ?? 'нет'}%, тренд 1ч: ${b.trend1h})`
          );
        }
        if (market.macroContext.eth) {
          const e = market.macroContext.eth;
          parts.push(
            `ETH $${e.priceUsd} (1ч: ${e.change1hPercent ?? 'нет'}%, 4ч: ${e.change4hPercent ?? 'нет'}%, 24ч: ${e.change24hPercent ?? 'нет'}%, тренд 1ч: ${e.trend1h})`
          );
        }
        lines.push(`- Макро-контекст крипторынка: ${parts.join(' | ')}`);
      }

      if (market.ohlc.length > 0) {
        const period = market.ohlcPeriodMinutes ?? 30;
        const count = market.ohlcPeriodMinutes === 15 ? 24 : 16;
        lines.push(`- Последние ${period}м OHLC-свечи (UTC, от старых к новым): ${formatCandles(market.ohlc, count)}`);
      }
      if (market.hourlyOhlc && market.hourlyOhlc.length > 0) {
        lines.push(`- Часовые OHLC-свечи (последние 18ч, UTC): ${formatCandles(market.hourlyOhlc, 18)}`);
      }
    }

    lines.push(...formatRecentFeedback(recentHistory, 'ru'));

    lines.push('');
    lines.push('Свежие приоритетные новости (сначала прямые PEARL):');
    if (prioritizedNews.length === 0) {
      lines.push('- Новостей по ключевым словам не найдено.');
    } else {
      for (const item of prioritizedNews) {
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
    `Твой предыдущий ответ не прошёл проверку (${parseError}). ` +
    'Исправь ошибку и верни ТОЛЬКО один валидный JSON-объект без markdown-блоков и лишнего текста со схемой: ' +
    '{"price_now": number|null, "direction": "up"|"down"|"sideways", "confidence": 0..100, ' +
    '"support": [], "resistance": [], "target_price": number|null, "stop_price": number|null, ' +
    '"chart_reasons": [], "news_impact": "", "news_reasons": [], "risks": []}.'
  );
}

export function validateForecastGuardrails(
  parsed: Omit<ForecastResult, 'modelName' | 'providerName' | 'responseTimeMs' | 'createdAtUtc'>,
  market?: MarketSnapshot | null,
  horizonHours: ForecastHorizonHours = 4
): GuardrailValidationOutcome {
  const fatalErrors: string[] = [];
  const warnings: string[] = [];
  const refPrice = market?.priceUsd ?? parsed.priceNow ?? null;
  const atr = market?.technicalIndicators?.atr14 ?? null;

  let support = [...parsed.support].filter((n) => Number.isFinite(n) && n > 0);
  let resistance = [...parsed.resistance].filter((n) => Number.isFinite(n) && n > 0);
  let targetPrice = parsed.targetPrice;
  let stopPrice = parsed.stopPrice;

  if (refPrice && refPrice > 0) {
    // Check directional invariants
    if (parsed.direction === ForecastDirection.Up) {
      if (targetPrice !== null && targetPrice <= refPrice) {
        fatalErrors.push(
          `direction=up, но target_price (${targetPrice}) <= текущей цены (${refPrice}).`
        );
      }
      if (stopPrice !== null && stopPrice >= refPrice) {
        fatalErrors.push(
          `direction=up, но stop_price (${stopPrice}) >= текущей цены (${refPrice}).`
        );
      }
    } else if (parsed.direction === ForecastDirection.Down) {
      if (targetPrice !== null && targetPrice >= refPrice) {
        fatalErrors.push(
          `direction=down, но target_price (${targetPrice}) >= текущей цены (${refPrice}).`
        );
      }
      if (stopPrice !== null && stopPrice <= refPrice) {
        fatalErrors.push(
          `direction=down, но stop_price (${stopPrice}) <= текущей цены (${refPrice}).`
        );
      }
    }

    // Filter misplaced support/resistance levels rather than letting inverted levels pollute chart HUD
    const invalidSup = support.filter((s) => s >= refPrice * 1.002);
    const invalidRes = resistance.filter((r) => r <= refPrice * 0.998);
    if (invalidSup.length > 0) {
      warnings.push(`Отфильтрованы некорректные уровни поддержки выше текущей цены (${invalidSup.join(', ')}).`);
      support = support.filter((s) => s < refPrice * 1.002);
    }
    if (invalidRes.length > 0) {
      warnings.push(`Отфильтрованы некорректные уровни сопротивления ниже текущей цены (${invalidRes.join(', ')}).`);
      resistance = resistance.filter((r) => r > refPrice * 0.998);
    }

    // Sort support descending (closest first) and resistance ascending (closest first)
    support.sort((a, b) => b - a);
    resistance.sort((a, b) => a - b);

    // Check ATR sanity
    if (atr && atr > 0) {
      const maxReasonableMove = atr * (horizonHours <= 1 ? 6 : horizonHours <= 2 ? 9 : 12);
      if (targetPrice !== null && Math.abs(targetPrice - refPrice) > maxReasonableMove) {
        warnings.push(
          `Цель (${targetPrice}) превышает реалистичный диапазон ATR для горизонта ${horizonHours}ч.`
        );
      }
      if (stopPrice !== null && Math.abs(refPrice - stopPrice) < atr * 0.15) {
        warnings.push(
          `Стоп (${stopPrice}) слишком близко к цене (<0.15×ATR), высокий риск шумового выбивания.`
        );
      }
    }
  }

  let riskRewardRatio: number | null = null;
  if (refPrice && targetPrice !== null && stopPrice !== null) {
    const reward = Math.abs(targetPrice - refPrice);
    const risk = Math.abs(refPrice - stopPrice);
    if (risk > 0 && reward > 0) {
      riskRewardRatio = Number((reward / risk).toFixed(2));
      if (riskRewardRatio < 0.7 && parsed.direction !== ForecastDirection.Sideways) {
        warnings.push(`Низкое соотношение прибыль/риск (R:R = ${riskRewardRatio}).`);
      }
    }
  }

  return {
    fatalErrors,
    warnings,
    riskRewardRatio,
    sanitized: {
      ...parsed,
      priceNow: parsed.priceNow ?? refPrice,
      support,
      resistance,
      targetPrice,
      stopPrice,
      horizonHours,
      riskRewardRatio,
      guardrailWarnings: warnings.length > 0 ? warnings : undefined,
    },
  };
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
