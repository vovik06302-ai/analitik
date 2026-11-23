import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTradeSignal } from './tradeSignal';
import { ForecastDirection, ForecastResult, MarketSnapshot } from '../types';

function makeMarket(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    symbol: 'PEARL / USDT',
    primaryExchange: 'Gate.io',
    candlesSource: 'Gate.io',
    priceUsd: 0.042,
    priceChange24hPercent: 4.5,
    high24h: 0.044,
    low24h: 0.039,
    volume24hUsd: 250_000,
    spreadPercent: 0.25,
    marketCapUsd: 1_800_000,
    dexLiquidityUsd: 120_000,
    tickers: [],
    ohlc: [],
    orderBook: {
      bestBid: 0.04195,
      bestAsk: 0.04205,
      bidVolume: 65000,
      askVolume: 35000,
      bands: [{ rangePercent: 1, bidVolume: 18000, askVolume: 9000, bidSharePercent: 66.7 }],
    },
    tradeFlow: {
      totalTrades: 80,
      buyVolume: 19500,
      sellVolume: 10500,
      cvd: 9000,
      buySharePercent: 65,
      windowMinutes: 30,
    },
    technicalIndicators: {
      ema9: 0.0421,
      ema21: 0.0412,
      ema50: 0.0405,
      ema200: 0.039,
      vwap: 0.0415,
      rsi14: 61.5,
      rsiDivergence: 'none',
      macd: { line: 0.0004, signal: 0.0002, histogram: 0.0002 },
      atr14: 0.0012,
      atrPercent: 2.8,
      bollinger: {
        upper: 0.044,
        middle: 0.0415,
        lower: 0.039,
        bandwidthPercent: 12.0,
        squeeze: false,
      },
      volumeRatio: 1.4,
      swingHighs: [0.0435],
      swingLows: [0.0395],
      pocPrice: 0.041,
      high7d: 0.045,
      low7d: 0.037,
      structure: 'HH/HL',
      multiTimeframe: [
        { timeframe: '15m', trend: 'bullish', emaFast: 0.0421, emaSlow: 0.0415, rsi14: 62 },
        { timeframe: '1h', trend: 'bullish', emaFast: 0.0419, emaSlow: 0.0411, rsi14: 59 },
        { timeframe: '4h', trend: 'bullish', emaFast: 0.0415, emaSlow: 0.0406, rsi14: 56 },
      ],
    },
    macroContext: {
      btc: {
        symbol: 'BTC/USDT',
        priceUsd: 92500,
        change1hPercent: 0.65,
        change4hPercent: 1.8,
        change24hPercent: 3.1,
        trend1h: 'bullish',
      },
      eth: {
        symbol: 'ETH/USDT',
        priceUsd: 3320,
        change1hPercent: 0.9,
        change4hPercent: 2.2,
        change24hPercent: 4.0,
        trend1h: 'bullish',
      },
    },
    anomalies: [],
    fetchedAtUtc: '2026-11-22T12:00:00Z',
    ...overrides,
  };
}

function makeForecast(overrides: Partial<ForecastResult> = {}): ForecastResult {
  return {
    priceNow: 0.042,
    direction: ForecastDirection.Up,
    confidence: 78,
    support: [0.0405, 0.0395],
    resistance: [0.0445, 0.046],
    targetPrice: 0.0452,
    stopPrice: 0.0405,
    chartReasons: ['Уверенный выход выше EMA21 и VWAP на растущем объёме.'],
    newsImpact: 'Позитивный фон на крипторынке поддерживает спрос на PEARL.',
    newsReasons: ['Рост интереса к альткоинам'],
    risks: ['Возможное сопротивление у 0.045'],
    modelName: 'gemini-4-hydrogen',
    providerName: 'Gemini API',
    responseTimeMs: 1200,
    createdAtUtc: '2026-11-22T12:01:00Z',
    horizonHours: 4,
    riskRewardRatio: 2.13,
    rawJson: '{}',
    ...overrides,
  };
}

test('buildTradeSignal returns null when neither forecast nor market data exists', () => {
  assert.equal(buildTradeSignal(null, null, 'ru'), null);
});

test('buildTradeSignal recommends BUY_PEARL (spend USDT) with strong conviction on bullish AI + market alignment', () => {
  const signal = buildTradeSignal(makeForecast(), makeMarket(), 'ru');
  assert.ok(signal);
  assert.equal(signal.action, 'BUY_PEARL');
  assert.equal(signal.strength, 'strong');
  assert.equal(signal.sourceMode, 'ai_and_market');
  assert.equal(signal.buyAsset, 'PEARL');
  assert.equal(signal.sellAsset, 'USDT');
  assert.ok(signal.basis.length >= 5);
  assert.ok(signal.bullishCount >= 5);
  assert.equal(signal.bearishCount, 0);
  assert.equal(signal.riskRewardRatio, 2.13);
});

test('buildTradeSignal recommends SELL_PEARL (move to USDT) on bearish AI + bearish market', () => {
  const bearishMarket = makeMarket({
    priceUsd: 0.04,
    orderBook: {
      bestBid: 0.0399,
      bestAsk: 0.0401,
      bidVolume: 30000,
      askVolume: 70000,
      bands: [{ rangePercent: 1, bidVolume: 7000, askVolume: 18000, bidSharePercent: 28 }],
    },
    tradeFlow: {
      totalTrades: 90,
      buyVolume: 8000,
      sellVolume: 21000,
      cvd: -13000,
      buySharePercent: 27.5,
      windowMinutes: 30,
    },
    technicalIndicators: {
      ...makeMarket().technicalIndicators!,
      ema9: 0.0398,
      ema21: 0.041,
      vwap: 0.0412,
      rsi14: 38.2,
      macd: { line: -0.0004, signal: -0.0001, histogram: -0.0003 },
      structure: 'LH/LL',
      multiTimeframe: [
        { timeframe: '15m', trend: 'bearish', emaFast: 0.0398, emaSlow: 0.0406, rsi14: 37 },
        { timeframe: '1h', trend: 'bearish', emaFast: 0.0402, emaSlow: 0.0411, rsi14: 41 },
      ],
    },
    macroContext: {
      btc: {
        symbol: 'BTC/USDT',
        priceUsd: 89000,
        change1hPercent: -1.1,
        change4hPercent: -2.4,
        change24hPercent: -4.2,
        trend1h: 'bearish',
      },
      eth: {
        symbol: 'ETH/USDT',
        priceUsd: 3100,
        change1hPercent: -1.4,
        change4hPercent: -3.0,
        change24hPercent: -5.0,
        trend1h: 'bearish',
      },
    },
  });

  const bearishForecast = makeForecast({
    priceNow: 0.04,
    direction: ForecastDirection.Down,
    confidence: 81,
    targetPrice: 0.037,
    stopPrice: 0.0412,
    riskRewardRatio: 2.5,
  });

  const signal = buildTradeSignal(bearishForecast, bearishMarket, 'en');
  assert.ok(signal);
  assert.equal(signal.action, 'SELL_PEARL');
  assert.equal(signal.strength, 'strong');
  assert.equal(signal.buyAsset, 'USDT');
  assert.equal(signal.sellAsset, 'PEARL');
  assert.ok(signal.actionTitle.includes('Sell PEARL'));
  assert.ok(signal.bearishCount >= 5);
});

test('buildTradeSignal forces WAIT_HOLD_USDT on sideways, low confidence, or poor R:R', () => {
  const sideways = buildTradeSignal(
    makeForecast({ direction: ForecastDirection.Sideways, confidence: 74 }),
    makeMarket(),
    'ru'
  );
  assert.equal(sideways?.action, 'WAIT_HOLD_USDT');
  assert.equal(sideways?.buyAsset, 'USDT');
  assert.equal(sideways?.sellAsset, null);

  const lowConf = buildTradeSignal(
    makeForecast({ direction: ForecastDirection.Up, confidence: 48 }),
    makeMarket(),
    'ru'
  );
  assert.equal(lowConf?.action, 'WAIT_HOLD_USDT');
  assert.ok(lowConf!.cautions.length > 0);

  const poorRr = buildTradeSignal(
    makeForecast({
      direction: ForecastDirection.Up,
      confidence: 80,
      targetPrice: 0.0425,
      stopPrice: 0.041,
      riskRewardRatio: 0.5,
    }),
    makeMarket(),
    'en'
  );
  assert.equal(poorRr?.action, 'WAIT_HOLD_USDT');
  assert.ok(poorRr!.cautions.some((c) => c.includes('R:R')));
});

test('buildTradeSignal computes preliminary market-only BUY_PEARL and WAIT_HOLD_USDT before AI runs', () => {
  const bullishPreliminary = buildTradeSignal(null, makeMarket(), 'ru');
  assert.ok(bullishPreliminary);
  assert.equal(bullishPreliminary.sourceMode, 'market_only');
  assert.equal(bullishPreliminary.action, 'BUY_PEARL');
  assert.equal(bullishPreliminary.strength, 'preliminary');
  assert.equal(bullishPreliminary.buyAsset, 'PEARL');
  assert.equal(bullishPreliminary.sellAsset, 'USDT');

  const mixedMarket = makeMarket({
    orderBook: {
      bestBid: 0.0419,
      bestAsk: 0.0421,
      bidVolume: 50000,
      askVolume: 50000,
      bands: [{ rangePercent: 1, bidVolume: 10000, askVolume: 10000, bidSharePercent: 50 }],
    },
    tradeFlow: {
      totalTrades: 40,
      buyVolume: 10000,
      sellVolume: 10000,
      cvd: 0,
      buySharePercent: 50,
      windowMinutes: 30,
    },
    technicalIndicators: {
      ...makeMarket().technicalIndicators!,
      ema9: 0.0415,
      ema21: 0.0415,
      rsi14: 50,
      macd: { line: 0, signal: 0, histogram: 0 },
      structure: 'range',
      multiTimeframe: [
        { timeframe: '15m', trend: 'neutral', emaFast: 0.0415, emaSlow: 0.0415, rsi14: 50 },
      ],
    },
    macroContext: {
      btc: {
        symbol: 'BTC/USDT',
        priceUsd: 92000,
        change1hPercent: 0.05,
        change4hPercent: 0.1,
        change24hPercent: 0.2,
        trend1h: 'neutral',
      },
      eth: null,
    },
  });

  const neutralPreliminary = buildTradeSignal(null, mixedMarket, 'ru');
  assert.ok(neutralPreliminary);
  assert.equal(neutralPreliminary.action, 'WAIT_HOLD_USDT');
  assert.equal(neutralPreliminary.strength, 'neutral');
});
