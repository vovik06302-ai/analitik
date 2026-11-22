export enum AiProviderType {
  Gemini = 'Gemini',
  Ollama = 'Ollama',
  Claude = 'Claude',
}

export enum ForecastDirection {
  Up = 'Up',
  Down = 'Down',
  Sideways = 'Sideways',
  Unknown = 'Unknown',
}

export enum ServiceConnectionState {
  Checking = 'Checking',
  Connected = 'Connected',
  NotConfigured = 'NotConfigured',
  Error = 'Error',
}

export type NewsSentiment = 'Bullish' | 'Bearish' | 'Neutral';
export type NewsRelevance = 'DirectPearl' | 'CryptoMarket';
export type ForecastHorizonHours = 1 | 2 | 4;
export type SafeTradeStatus = 'direct' | 'blocked_403' | 'unavailable';
export type ForecastOutcomeStatus = 'target_hit' | 'stop_hit' | 'expired' | 'pending';

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Запоминаем, что область графика выбрана на обычном снимке экрана настольной программы:
// тогда при авто-анализе программа сама снимает тот же экран и вырезает ту же область.
export const DESKTOP_CAPTURE_SOURCE_KEY = 'pearl_desktop_capture_source';
export const DESKTOP_CAPTURE_DISPLAY_KEY = 'pearl_desktop_capture_display';

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  matchedQuery: string;
  formattedDate: string;
  sentiment?: NewsSentiment;
  relevance?: NewsRelevance;
  relevanceScore?: number;
}

export interface NewsFetchResult {
  items: NewsItem[];
  errors: string[];
}

export interface ExchangeTicker {
  exchange: string;
  pair: string;
  lastPrice: number;
  volumeUsd24h: number;
  spreadPercent: number;
}

export interface OhlcCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface OrderBookBand {
  rangePercent: number;
  bidVolume: number;
  askVolume: number;
  bidSharePercent: number;
}

export interface OrderBookWall {
  side: 'bid' | 'ask';
  price: number;
  amount: number;
  valueUsd: number;
  distancePercent: number;
}

export interface OrderBookSummary {
  bestBid: number | null;
  bestAsk: number | null;
  bidVolume: number;
  askVolume: number;
  bands?: OrderBookBand[];
  largestBidWall?: OrderBookWall | null;
  largestAskWall?: OrderBookWall | null;
}

export interface TradeFlowSummary {
  totalTrades: number;
  buyVolume: number;
  sellVolume: number;
  cvd: number;
  buySharePercent: number;
  windowMinutes: number;
}

export interface TimeframeTrend {
  timeframe: '15m' | '1h' | '4h' | '1d';
  trend: 'bullish' | 'bearish' | 'neutral';
  emaFast: number | null;
  emaSlow: number | null;
  rsi14: number | null;
}

export interface TechnicalIndicators {
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  vwap: number | null;
  rsi14: number | null;
  rsiDivergence: 'bullish' | 'bearish' | 'none';
  macd: {
    line: number | null;
    signal: number | null;
    histogram: number | null;
  };
  atr14: number | null;
  atrPercent: number | null;
  bollinger: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    bandwidthPercent: number | null;
    squeeze: boolean;
  };
  volumeRatio: number | null;
  swingHighs: number[];
  swingLows: number[];
  pocPrice: number | null;
  high7d: number | null;
  low7d: number | null;
  structure: 'HH/HL' | 'LH/LL' | 'range';
  multiTimeframe: TimeframeTrend[];
}

export interface MacroAssetSnapshot {
  symbol: string;
  priceUsd: number;
  change1hPercent: number | null;
  change4hPercent: number | null;
  change24hPercent: number | null;
  trend1h: 'bullish' | 'bearish' | 'neutral';
}

export interface MacroContext {
  btc: MacroAssetSnapshot | null;
  eth: MacroAssetSnapshot | null;
}

export interface MarketSnapshot {
  symbol: string;
  primaryExchange: string;
  candlesSource?: string;
  safeTradeStatus?: SafeTradeStatus;
  priceUsd: number;
  priceChange24hPercent: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24hUsd: number | null;
  spreadPercent: number | null;
  marketCapUsd: number | null;
  dexLiquidityUsd: number | null;
  tickers: ExchangeTicker[];
  ohlc: OhlcCandle[];
  ohlcPeriodMinutes?: number;
  hourlyOhlc?: OhlcCandle[];
  candles4h?: OhlcCandle[];
  candles1d?: OhlcCandle[];
  orderBook?: OrderBookSummary;
  tradeFlow?: TradeFlowSummary;
  technicalIndicators?: TechnicalIndicators;
  macroContext?: MacroContext;
  anomalies: string[];
  fetchedAtUtc: string;
}

export interface ModelVote {
  provider: string;
  model: string;
  direction: ForecastDirection;
  confidence: number;
  weight?: number;
  historicalWinRate?: number | null;
  priceNow: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  responseTimeMs: number;
  error?: string;
}

export interface ConsensusSummary {
  totalQueried: number;
  totalSucceeded: number;
  agreementPercent: number;
  hasDisagreement: boolean;
  votes: ModelVote[];
}

export interface ForecastResult {
  priceNow: number | null;
  direction: ForecastDirection;
  confidence: number;
  support: number[];
  resistance: number[];
  targetPrice: number | null;
  stopPrice: number | null;
  chartReasons: string[];
  newsImpact: string;
  newsReasons: string[];
  risks: string[];
  modelName: string;
  requestedModel?: string;
  fallbackNotice?: string;
  guardrailWarnings?: string[];
  riskRewardRatio?: number | null;
  horizonHours?: ForecastHorizonHours;
  providerName: string;
  responseTimeMs: number;
  createdAtUtc: string;
  screenshotDataUrl?: string;
  rawJson: string;
  consensus?: ConsensusSummary;
  marketSnapshot?: MarketSnapshot | null;
}

export interface ForecastHistoryEntry {
  id: number;
  createdAtUtc: string;
  priceNow: number | null;
  direction: ForecastDirection;
  confidence: number;
  targetPrice: number | null;
  stopPrice: number | null;
  supportText: string;
  resistanceText: string;
  chartReasons: string;
  newsImpact: string;
  newsReasons: string;
  risks: string;
  modelName: string;
  providerName: string;
  responseTimeMs: number;
  screenshotDataUrl?: string;
  actualPrice1h?: number | null;
  actualPrice2h?: number | null;
  actualPrice4h?: number | null;
  horizonHours?: number | null;
  atrPercentAtForecast?: number | null;
  outcomeStatus?: ForecastOutcomeStatus | null;
  highDuringHorizon?: number | null;
  lowDuringHorizon?: number | null;
  newsSnapshot?: NewsItem[];
  marketPriceAtForecast?: number | null;
  consensusSummary?: ConsensusSummary | null;
}

export interface HorizonAccuracy {
  hours: number;
  evaluableCount: number;
  correctCount: number;
  accuracyPercent: number | null;
  hasSufficientData: boolean;
}

export interface CalibrationStats {
  highConfTotal: number;
  highConfCorrect: number;
  highConfWinRate: number | null;
  avgTargetErrorPercent: number | null;
  targetHitCount: number;
  stopHitCount: number;
  targetHitRate: number | null;
}

export interface AccuracyMetrics {
  oneHour: HorizonAccuracy;
  twoHours: HorizonAccuracy;
  fourHours: HorizonAccuracy;
  calibration: CalibrationStats;
}

export interface AppSettings {
  captureRegion: CaptureRegion;
  autoIntervalMinutes: number;
  autoModeEnabled: boolean;
  forecastHorizonHours: ForecastHorizonHours;
  useExchangeData: boolean;
  provider: AiProviderType;
  consensusMode: boolean;
  geminiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  claudeModel: string;
  claudeApiKey: string;
  rssFeeds: string[];
  newsKeywords: string[];
  notifyOnDirectionChange: boolean;
  notifyConfidenceThreshold: number;
  minimizeToTrayOnClose: boolean;
  autoStartWithWindows: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  webhookUrl: string;
  language: 'ru' | 'en';
}

export interface ProviderStatus {
  state: ServiceConnectionState;
  isConnected: boolean;
  statusMessage: string;
  hintMessage?: string;
  troubleshootingTooltip: string;
  installedModels?: string[];
}

export const APP_VERSION = '1.0.26';
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5vl:32b';
export const FALLBACK_OLLAMA_MODEL = 'qwen2.5vl:7b';
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';
export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

export const DEFAULT_GEMINI_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
];

export const DEFAULT_CLAUDE_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
];

export const DEFAULT_NEWS_KEYWORDS = [
  'Pearl PRL',
  'Pearl Research Labs',
  'PEARL USDT',
  'SafeTrade',
];

export const DEFAULT_RSS_FEEDS = [
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://cointelegraph.com/rss',
  'https://decrypt.co/feed',
  'https://cryptoslate.com/feed/',
];

export const DEFAULT_SETTINGS: AppSettings = {
  captureRegion: { x: 0, y: 0, width: 0, height: 0 },
  autoIntervalMinutes: 15,
  autoModeEnabled: false,
  forecastHorizonHours: 4,
  useExchangeData: true,
  provider: AiProviderType.Gemini,
  consensusMode: false,
  geminiModel: DEFAULT_GEMINI_MODEL,
  ollamaUrl: DEFAULT_OLLAMA_URL,
  ollamaModel: DEFAULT_OLLAMA_MODEL,
  claudeModel: DEFAULT_CLAUDE_MODEL,
  claudeApiKey: '',
  rssFeeds: [...DEFAULT_RSS_FEEDS],
  newsKeywords: [...DEFAULT_NEWS_KEYWORDS],
  notifyOnDirectionChange: true,
  notifyConfidenceThreshold: 70,
  minimizeToTrayOnClose: true,
  autoStartWithWindows: false,
  telegramBotToken: '',
  telegramChatId: '',
  webhookUrl: '',
  language: 'ru',
};
