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

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
}

export interface MarketSnapshot {
  symbol: string;
  primaryExchange: string;
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
  anomalies: string[];
  fetchedAtUtc: string;
}

export interface ModelVote {
  provider: string;
  model: string;
  direction: ForecastDirection;
  confidence: number;
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

export const APP_VERSION = '1.1.0';
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
