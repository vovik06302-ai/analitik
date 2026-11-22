import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Loader2, Play, Radio, Square, Users, X } from 'lucide-react';
import {
  AiProviderType,
  AppSettings,
  CaptureRegion,
  DEFAULT_CLAUDE_MODELS,
  DESKTOP_CAPTURE_DISPLAY_KEY,
  DESKTOP_CAPTURE_SOURCE_KEY,
  DEFAULT_GEMINI_MODELS,
  DEFAULT_SETTINGS,
  ForecastDirection,
  ForecastHistoryEntry,
  ForecastHorizonHours,
  ForecastResult,
  MarketSnapshot,
  NewsFetchResult,
  NewsItem,
  ProviderStatus,
  ServiceConnectionState,
} from './types';
import { t } from './i18n/translations';
import { formatPrice, formatRegionBadge, getDirectionLabel } from './utils/forecast';
import { Sidebar } from './components/Sidebar';
import { ForecastView } from './components/ForecastView';
import { NewsView } from './components/NewsView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { RegionSelectionModal } from './components/RegionSelectionModal';

const SETTINGS_STORAGE_KEY = 'pearl_ai_settings_v2';
const LEGACY_SETTINGS_STORAGE_KEY = 'pearl_ai_settings_v1';

function normalizeHorizon(raw: unknown): ForecastHorizonHours {
  if (raw === 1 || raw === 2 || raw === 4) return raw;
  return 4;
}

function loadSavedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        forecastHorizonHours: normalizeHorizon(parsed.forecastHorizonHours),
        captureRegion: {
          ...DEFAULT_SETTINGS.captureRegion,
          ...(parsed.captureRegion ?? {}),
        },
        newsKeywords:
          Array.isArray(parsed.newsKeywords) && parsed.newsKeywords.length > 0
            ? parsed.newsKeywords
            : [...DEFAULT_SETTINGS.newsKeywords],
        rssFeeds: Array.isArray(parsed.rssFeeds) ? parsed.rssFeeds : [...DEFAULT_SETTINGS.rssFeeds],
      };
    }

    const legacyRaw = localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        forecastHorizonHours: normalizeHorizon(parsed.forecastHorizonHours),
        captureRegion: {
          ...DEFAULT_SETTINGS.captureRegion,
          ...(parsed.captureRegion ?? {}),
        },
        newsKeywords:
          Array.isArray(parsed.newsKeywords) && parsed.newsKeywords.length > 0
            ? parsed.newsKeywords
            : [...DEFAULT_SETTINGS.newsKeywords],
        rssFeeds:
          Array.isArray(parsed.rssFeeds) && parsed.rssFeeds.length > 0
            ? parsed.rssFeeds
            : [...DEFAULT_SETTINGS.rssFeeds],
      };
    }

    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface DesktopBridgeApi {
  captureScreen?: (options?: {
    silent?: boolean;
    displayId?: string;
  }) => Promise<{ ok: boolean; dataUrl?: string }>;
  installUpdate?: (url: string) => Promise<{ ok: boolean; error?: string }>;
  setDesktopSettings?: (opts: {
    minimizeToTrayOnClose: boolean;
    autoStartWithWindows: boolean;
  }) => Promise<{ ok: boolean }>;
  getDesktopSettings?: () => Promise<{
    minimizeToTrayOnClose: boolean;
    autoStartWithWindows: boolean;
  }>;
}

function getDesktopApi(): DesktopBridgeApi | undefined {
  return (window as unknown as { pearlDesktop?: DesktopBridgeApi }).pearlDesktop;
}

function forgetDesktopCapture(): void {
  try {
    localStorage.removeItem(DESKTOP_CAPTURE_SOURCE_KEY);
    localStorage.removeItem(DESKTOP_CAPTURE_DISPLAY_KEY);
  } catch {
    // localStorage недоступен
  }
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSavedSettings());
  const [history, setHistory] = useState<ForecastHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);

  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotCapturedAt, setScreenshotCapturedAt] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);

  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);
  const [marketError, setMarketError] = useState('');

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLastUpdated, setNewsLastUpdated] = useState<string>(() =>
    t(loadSavedSettings().language, 'NoData')
  );
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [newsError, setNewsError] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isVerifyingMarket, setIsVerifyingMarket] = useState(false);
  const [analysisStepText, setAnalysisStepText] = useState('');
  const [errorBannerText, setErrorBannerText] = useState('');
  const [infoBannerText, setInfoBannerText] = useState('');

  const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);
  const [liveStreamActive, setLiveStreamActive] = useState(false);
  const [nextAutoRunMs, setNextAutoRunMs] = useState<number | null>(null);
  const [autoCountdownText, setAutoCountdownText] = useState('');

  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);
  const [isCheckingClaude, setIsCheckingClaude] = useState(false);

  const [geminiStatus, setGeminiStatus] = useState<ProviderStatus>({
    state: ServiceConnectionState.Checking,
    isConnected: false,
    statusMessage: t(settings.language, 'ConnectionChecking'),
    troubleshootingTooltip: t(settings.language, 'ConnectionChecking'),
  });
  const [ollamaStatus, setOllamaStatus] = useState<ProviderStatus>({
    state: ServiceConnectionState.Checking,
    isConnected: false,
    statusMessage: t(settings.language, 'ConnectionChecking'),
    troubleshootingTooltip: t(settings.language, 'ConnectionChecking'),
    installedModels: [],
  });
  const [claudeStatus, setClaudeStatus] = useState<ProviderStatus>({
    state: ServiceConnectionState.Checking,
    isConnected: false,
    statusMessage: t(settings.language, 'ConnectionChecking'),
    troubleshootingTooltip: t(settings.language, 'ConnectionChecking'),
  });

  const lastNotifiedDirectionRef = useRef<ForecastDirection>(ForecastDirection.Unknown);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const screenshotRef = useRef(screenshotDataUrl);
  screenshotRef.current = screenshotDataUrl;
  const marketRef = useRef(market);
  marketRef.current = market;
  const isAnalyzingRef = useRef(isAnalyzing);
  isAnalyzingRef.current = isAnalyzing;

  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveCropRef = useRef<{ x: number; y: number; w: number; h: number }>({
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  });

  const lang = settings.language;

  const syncDesktopSettings = useCallback((next: AppSettings) => {
    const api = getDesktopApi();
    if (api?.setDesktopSettings) {
      void api.setDesktopSettings({
        minimizeToTrayOnClose: next.minimizeToTrayOnClose,
        autoStartWithWindows: next.autoStartWithWindows,
      });
    }
  }, []);

  useEffect(() => {
    syncDesktopSettings(settingsRef.current);
  }, [syncDesktopSettings]);

  const stopLiveStream = useCallback(() => {
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((tr) => tr.stop());
      liveStreamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setLiveStreamActive(false);
  }, []);

  const captureFromLiveStream = useCallback((): string | null => {
    const video = liveVideoRef.current;
    const stream = liveStreamRef.current;
    if (!video || !stream || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const crop = liveCropRef.current;
    const sx = Math.max(0, Math.round(crop.x * video.videoWidth));
    const sy = Math.max(0, Math.round(crop.y * video.videoHeight));
    const sw = Math.max(1, Math.round(crop.w * video.videoWidth));
    const sh = Math.max(1, Math.round(crop.h * video.videoHeight));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = canvas.toDataURL('image/png');
    setScreenshotDataUrl(dataUrl);
    setScreenshotCapturedAt(new Date().toISOString());
    screenshotRef.current = dataUrl;
    return dataUrl;
  }, []);

  useEffect(() => {
    return () => {
      stopLiveStream();
    };
  }, [stopLiveStream]);

  const persistSettings = useCallback(
    (next: AppSettings) => {
      setSettings(next);
      syncDesktopSettings(next);
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota issues
      }
    },
    [syncDesktopSettings]
  );

  const refreshMarket = useCallback(async (force = false): Promise<MarketSnapshot | null> => {
    setIsLoadingMarket(true);
    setMarketError('');
    try {
      const res = await fetch(`/api/market${force ? '?force=1' : ''}`);
      const data = (await res.json()) as MarketSnapshot & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setMarket(data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMarketError(msg);
      return marketRef.current;
    } finally {
      setIsLoadingMarket(false);
    }
  }, []);

  const fetchServerHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history');
      const data = (await res.json()) as { entries?: ForecastHistoryEntry[] };
      if (Array.isArray(data.entries)) {
        setHistory(data.entries);
      }
    } catch {
      // Keep current list on transient failure
    }
  }, []);

  const refreshGeminiStatus = useCallback(async (targetLang = settingsRef.current.language) => {
    try {
      const res = await fetch(`/api/gemini/status?lang=${targetLang}`);
      const data = (await res.json()) as ProviderStatus;
      setGeminiStatus(data);
    } catch {
      setGeminiStatus({
        state: ServiceConnectionState.Error,
        isConnected: false,
        statusMessage: t(targetLang, 'GeminiNotConfigured'),
        troubleshootingTooltip: t(targetLang, 'GeminiTooltipNotConfigured'),
      });
    }
  }, []);

  const refreshOllamaStatus = useCallback(
    async (overrideUrl?: string, targetLang = settingsRef.current.language) => {
      setIsCheckingOllama(true);
      try {
        const res = await fetch('/api/ollama/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseUrl: overrideUrl ?? settingsRef.current.ollamaUrl,
            lang: targetLang,
          }),
        });
        const data = (await res.json()) as ProviderStatus;
        setOllamaStatus(data);
        setAvailableOllamaModels(data.installedModels ?? []);
      } catch {
        setOllamaStatus({
          state: ServiceConnectionState.Error,
          isConnected: false,
          statusMessage: t(targetLang, 'OllamaOffline'),
          hintMessage: t(targetLang, 'OllamaOfflineHint'),
          troubleshootingTooltip: t(targetLang, 'OllamaOfflineHint'),
          installedModels: [],
        });
        setAvailableOllamaModels([]);
      } finally {
        setIsCheckingOllama(false);
      }
    },
    []
  );

  const refreshClaudeStatus = useCallback(
    async (overrideKey?: string, targetLang = settingsRef.current.language) => {
      setIsCheckingClaude(true);
      try {
        const res = await fetch('/api/claude/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: overrideKey ?? settingsRef.current.claudeApiKey,
            lang: targetLang,
          }),
        });
        const data = (await res.json()) as ProviderStatus;
        setClaudeStatus(data);
      } catch {
        setClaudeStatus({
          state: ServiceConnectionState.Error,
          isConnected: false,
          statusMessage: t(targetLang, 'ClaudeOffline'),
          troubleshootingTooltip: t(targetLang, 'ClaudeOffline'),
        });
      } finally {
        setIsCheckingClaude(false);
      }
    },
    []
  );

  const refreshAllConnections = useCallback(async () => {
    await Promise.all([
      refreshGeminiStatus(),
      refreshOllamaStatus(),
      refreshClaudeStatus(),
    ]);
  }, [refreshGeminiStatus, refreshOllamaStatus, refreshClaudeStatus]);

  const refreshNews = useCallback(async (customSettings?: AppSettings) => {
    const active = customSettings ?? settingsRef.current;
    setIsLoadingNews(true);
    setNewsError('');
    try {
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rssFeeds: active.rssFeeds,
          keywords: active.newsKeywords,
        }),
      });
      const data = (await res.json()) as NewsFetchResult;
      const items = Array.isArray(data.items) ? data.items : [];
      setNewsItems(items);

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setNewsLastUpdated(
        `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(
          now.getHours()
        )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      );

      if (items.length === 0 && data.errors?.length) {
        setNewsError(`Не удалось загрузить новости: ${data.errors.join(' ')}`);
      }
      return items;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setNewsError(`Не удалось загрузить новости: ${msg}`);
      return [];
    } finally {
      setIsLoadingNews(false);
    }
  }, []);

  // Initial load & periodic polling
  useEffect(() => {
    void refreshAllConnections();
    void refreshMarket();
    void refreshNews();
    void fetchServerHistory();

    const connPoll = setInterval(() => {
      void refreshAllConnections();
    }, 20000);
    const marketPoll = setInterval(() => {
      void refreshMarket();
    }, 45000);

    return () => {
      clearInterval(connPoll);
      clearInterval(marketPoll);
    };
  }, [refreshAllConnections, refreshMarket, refreshNews, fetchServerHistory]);

  // Global clipboard Ctrl+V image paste support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              const dataUrl = reader.result;
              const img = new Image();
              img.onload = () => {
                stopLiveStream();
                forgetDesktopCapture();
                const region: CaptureRegion = {
                  x: 0,
                  y: 0,
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                };
                setScreenshotDataUrl(dataUrl);
                setScreenshotCapturedAt(new Date().toISOString());
                const next = { ...settingsRef.current, captureRegion: region };
                persistSettings(next);
                setInfoBannerText(
                  settingsRef.current.language === 'en'
                    ? `Screenshot pasted: ${region.width}×${region.height}`
                    : `Скриншот вставлен из буфера: ${region.width}×${region.height}`
                );
              };
              img.src = dataUrl;
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [persistSettings, stopLiveStream]);

  const handleImageFileDropped = useCallback(
    (file: File) => {
      stopLiveStream();
      forgetDesktopCapture();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        const dataUrl = reader.result;
        const img = new Image();
        img.onload = () => {
          const region: CaptureRegion = {
            x: 0,
            y: 0,
            width: img.naturalWidth,
            height: img.naturalHeight,
          };
          setScreenshotDataUrl(dataUrl);
          setScreenshotCapturedAt(new Date().toISOString());
          persistSettings({ ...settingsRef.current, captureRegion: region });
          setInfoBannerText(
            settingsRef.current.language === 'en'
              ? `Screenshot loaded: ${region.width}×${region.height}`
              : `Скриншот загружен: ${region.width}×${region.height}`
          );
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [persistSettings, stopLiveStream]
  );

  // Авто-снимок без живого потока: снимаем тот же экран и вырезаем сохранённую область.
  const captureDesktopRegion = useCallback(async (): Promise<string | null> => {
    const api = getDesktopApi();
    if (!api?.captureScreen) return null;
    let displayId: string | null = null;
    try {
      if (localStorage.getItem(DESKTOP_CAPTURE_SOURCE_KEY) !== 'still') return null;
      displayId = localStorage.getItem(DESKTOP_CAPTURE_DISPLAY_KEY);
    } catch {
      return null;
    }
    const region = settingsRef.current.captureRegion;
    if (!displayId || !region || region.width <= 0 || region.height <= 0) return null;

    try {
      const result = await api.captureScreen({ silent: true, displayId });
      if (!result.ok || !result.dataUrl) return null;
      const shot = result.dataUrl;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image load failed'));
        img.src = shot;
      });
      const x = Math.max(0, Math.min(region.x, img.naturalWidth - 1));
      const y = Math.max(0, Math.min(region.y, img.naturalHeight - 1));
      const w = Math.max(1, Math.min(region.width, img.naturalWidth - x));
      const h = Math.max(1, Math.min(region.height, img.naturalHeight - y));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/png');
      setScreenshotDataUrl(dataUrl);
      setScreenshotCapturedAt(new Date().toISOString());
      screenshotRef.current = dataUrl;
      return dataUrl;
    } catch {
      return null;
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    if (isAnalyzingRef.current) return;
    const activeSettings = settingsRef.current;

    const useExchange = activeSettings.useExchangeData;
    const liveCaptured = !useExchange && liveStreamActive ? captureFromLiveStream() : null;
    const desktopCaptured = !useExchange && !liveCaptured ? await captureDesktopRegion() : null;
    const currentImage = useExchange
      ? ''
      : liveCaptured ?? desktopCaptured ?? screenshotRef.current ?? '';

    setIsAnalyzing(true);
    setErrorBannerText('');
    setInfoBannerText('');

    try {
      setAnalysisStepText(
        activeSettings.language === 'en'
          ? 'Fetching market indicators, BTC/ETH & news...'
          : 'Загрузка рынка, индикаторов, BTC/ETH и новостей...'
      );

      const [latestNewsRes, latestMarketRes] = await Promise.allSettled([
        refreshNews(activeSettings),
        refreshMarket(useExchange),
      ]);

      const latestNews =
        latestNewsRes.status === 'fulfilled' ? latestNewsRes.value : newsItems;
      const latestMarket =
        latestMarketRes.status === 'fulfilled' ? latestMarketRes.value : marketRef.current;

      if (!currentImage && !latestMarket) {
        setErrorBannerText(
          useExchange
            ? activeSettings.language === 'en'
              ? 'Could not load live exchange market data.'
              : 'Не удалось загрузить рыночные данные с бирж.'
            : t(activeSettings.language, 'ErrorSelectImageFirst')
        );
        return;
      }

      const activeModel =
        activeSettings.provider === AiProviderType.Claude
          ? activeSettings.claudeModel
          : activeSettings.provider === AiProviderType.Ollama
          ? activeSettings.ollamaModel
          : activeSettings.geminiModel;

      const endpoint = activeSettings.consensusMode
        ? '/api/analyze/consensus'
        : '/api/analyze';

      setAnalysisStepText(
        activeSettings.consensusMode
          ? activeSettings.language === 'en'
            ? `Running AI Council (${activeSettings.forecastHorizonHours}h)...`
            : `Совет ИИ (${activeSettings.forecastHorizonHours}ч)...`
          : activeSettings.language === 'en'
          ? `Analyzing via ${activeSettings.provider} (${activeModel})...`
          : `Анализ через ${activeSettings.provider} (${activeModel})...`
      );

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeSettings.provider,
          model: activeModel,
          geminiModel: activeSettings.geminiModel,
          claudeModel: activeSettings.claudeModel,
          ollamaModel: activeSettings.ollamaModel,
          ollamaUrl: activeSettings.ollamaUrl,
          claudeApiKey: activeSettings.claudeApiKey,
          horizonHours: activeSettings.forecastHorizonHours,
          imageBase64: currentImage,
          news: latestNews,
          marketSnapshot: latestMarket,
          lang: activeSettings.language,
          previousDirection: lastNotifiedDirectionRef.current,
          notifyOnDirectionChange: activeSettings.notifyOnDirectionChange,
          notifyConfidenceThreshold: activeSettings.notifyConfidenceThreshold,
          telegramBotToken: activeSettings.telegramBotToken,
          telegramChatId: activeSettings.telegramChatId,
          webhookUrl: activeSettings.webhookUrl,
        }),
      });

      const payload = (await response.json()) as ForecastResult & {
        error?: string;
        historyEntry?: ForecastHistoryEntry;
      };
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const result: ForecastResult = {
        ...payload,
        screenshotDataUrl: currentImage || undefined,
        marketSnapshot: latestMarket,
      };
      setForecast(result);

      if (payload.historyEntry) {
        setHistory((prev) => [payload.historyEntry!, ...prev]);
      } else {
        void fetchServerHistory();
      }

      const directionChanged =
        lastNotifiedDirectionRef.current !== ForecastDirection.Unknown &&
        result.direction !== lastNotifiedDirectionRef.current;
      const aboveThreshold =
        result.confidence >= activeSettings.notifyConfidenceThreshold;

      if (
        ((activeSettings.notifyOnDirectionChange && directionChanged) || aboveThreshold) &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification('Pearl AI Analyst — PEARL/USDT', {
          body: `${getDirectionLabel(result.direction, activeSettings.language)} (${
            result.confidence
          }%, ${result.horizonHours ?? activeSettings.forecastHorizonHours}h) • ${formatPrice(
            result.priceNow,
            t(activeSettings.language, 'NoData')
          )}`,
        });
      }

      lastNotifiedDirectionRef.current = result.direction;
      const sourceNote =
        latestMarket && latestMarket.safeTradeStatus === 'blocked_403'
          ? activeSettings.language === 'en'
            ? ` • Candles: ${latestMarket.candlesSource} (SafeTrade 403)`
            : ` • Свечи: ${latestMarket.candlesSource} (SafeTrade 403)`
          : '';
      const fallbackNote = result.fallbackNotice ? ` • ${result.fallbackNotice}` : '';

      setInfoBannerText(
        activeSettings.language === 'en'
          ? `Analysis (${result.horizonHours ?? activeSettings.forecastHorizonHours}h) completed in ${(
              result.responseTimeMs / 1000
            ).toFixed(1)}s (${result.modelName})${sourceNote}${fallbackNote}.`
          : `Анализ (${result.horizonHours ?? activeSettings.forecastHorizonHours}ч) завершён за ${(
              result.responseTimeMs / 1000
            ).toFixed(1)} с (${result.modelName})${sourceNote}${fallbackNote}.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBannerText(msg);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStepText('');
      if (settingsRef.current.autoModeEnabled) {
        setNextAutoRunMs(Date.now() + settingsRef.current.autoIntervalMinutes * 60 * 1000);
      }
    }
  }, [
    captureDesktopRegion,
    captureFromLiveStream,
    fetchServerHistory,
    liveStreamActive,
    newsItems,
    refreshMarket,
    refreshNews,
  ]);

  // Разовый запуск анализа без автоматического включения таймера.
  const handleAnalyzeClick = () => {
    void runAnalysis();
  };

  // Отдельное управление авто-режимом.
  const handleToggleAuto = () => {
    const nextEnabled = !settingsRef.current.autoModeEnabled;
    persistSettings({ ...settingsRef.current, autoModeEnabled: nextEnabled });
    if (nextEnabled) {
      setInfoBannerText(
        lang === 'en'
          ? `Auto-analysis enabled (every ${settingsRef.current.autoIntervalMinutes} min).`
          : `Авто-режим включён (каждые ${settingsRef.current.autoIntervalMinutes} мин).`
      );
    } else {
      setInfoBannerText(lang === 'en' ? 'Auto-analysis stopped.' : 'Авто-режим остановлен.');
    }
  };

  // Auto-mode timer setup
  useEffect(() => {
    if (settings.autoModeEnabled) {
      setNextAutoRunMs(Date.now() + settings.autoIntervalMinutes * 60 * 1000);
    } else {
      setNextAutoRunMs(null);
      setAutoCountdownText('');
    }
  }, [settings.autoModeEnabled, settings.autoIntervalMinutes]);

  useEffect(() => {
    if (!settings.autoModeEnabled || nextAutoRunMs === null) return;
    const timer = setInterval(() => {
      if (isAnalyzingRef.current) return;
      const remMs = nextAutoRunMs - Date.now();
      if (remMs <= 0) {
        setNextAutoRunMs(Date.now() + settingsRef.current.autoIntervalMinutes * 60 * 1000);
        void runAnalysis();
      } else {
        const totalSec = Math.floor(remMs / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        setAutoCountdownText(
          `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        );
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [settings.autoModeEnabled, nextAutoRunMs, runAnalysis]);

  const activeModels = useMemo(() => {
    if (settings.provider === AiProviderType.Gemini) {
      return DEFAULT_GEMINI_MODELS;
    }
    if (settings.provider === AiProviderType.Claude) {
      const list = [...DEFAULT_CLAUDE_MODELS];
      if (settings.claudeModel && !list.includes(settings.claudeModel)) {
        list.push(settings.claudeModel);
      }
      return list;
    }
    return availableOllamaModels;
  }, [settings.provider, settings.claudeModel, availableOllamaModels]);

  const selectedModel = useMemo(() => {
    if (settings.provider === AiProviderType.Gemini) return settings.geminiModel;
    if (settings.provider === AiProviderType.Claude) return settings.claudeModel;
    if (availableOllamaModels.includes(settings.ollamaModel)) return settings.ollamaModel;
    return availableOllamaModels[0] ?? '';
  }, [settings, availableOllamaModels]);

  const modelSelectorHint = useMemo(() => {
    if (settings.provider !== AiProviderType.Ollama) return '';
    if (availableOllamaModels.length > 0) return '';
    return ollamaStatus.isConnected ? t(lang, 'NoOllamaModelsShort') : t(lang, 'OllamaOffline');
  }, [settings.provider, availableOllamaModels.length, ollamaStatus.isConnected, lang]);

  const handleSaveSettings = (next: AppSettings) => {
    persistSettings(next);
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default' &&
      (next.notifyOnDirectionChange || next.notifyConfidenceThreshold > 0)
    ) {
      void Notification.requestPermission();
    }
    void refreshGeminiStatus(next.language);
    void refreshOllamaStatus(next.ollamaUrl, next.language);
    void refreshClaudeStatus(next.claudeApiKey, next.language);
  };

  const handleCheckUpdates = async (): Promise<string> => {
    try {
      const res = await fetch('/api/updates');
      const data = (await res.json()) as {
        status: string;
        message: string;
        latestVersion?: string;
        downloadUrl?: string;
      };
      if (data.status === 'update_available' || data.status === 'up_to_date') {
        setInfoBannerText(data.message);
      } else {
        setErrorBannerText(data.message);
      }

      const desktop = getDesktopApi();
      if (data.status === 'update_available' && data.downloadUrl && desktop?.installUpdate) {
        const agree = window.confirm(
          `${data.message}\n\nСкачать и установить сейчас? Программа закроется и запустится установщик.`
        );
        if (agree) {
          setInfoBannerText('Скачиваю обновление…');
          const result = await desktop.installUpdate(data.downloadUrl);
          if (!result.ok) {
            const failMsg = result.error ?? 'Не удалось установить обновление.';
            setErrorBannerText(failMsg);
            return failMsg;
          }
          return 'Обновление загружено, запускается установщик…';
        }
      }
      return data.message;
    } catch {
      const msg =
        lang === 'en'
          ? 'Could not check updates: GitHub unreachable.'
          : 'Не удалось проверить обновления: GitHub недоступен.';
      setErrorBannerText(msg);
      return msg;
    }
  };

  const handleTestAlert = async (draftSettings: AppSettings): Promise<string> => {
    try {
      const res = await fetch('/api/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang: draftSettings.language,
          telegramBotToken: draftSettings.telegramBotToken,
          telegramChatId: draftSettings.telegramChatId,
          webhookUrl: draftSettings.webhookUrl,
        }),
      });
      const data = (await res.json()) as {
        telegramSent: boolean;
        webhookSent: boolean;
        errors: string[];
      };
      const parts: string[] = [];
      if (data.telegramSent) parts.push('Telegram ✓');
      if (data.webhookSent) parts.push('Webhook ✓');
      if (data.errors.length > 0) parts.push(`Errors: ${data.errors.join(', ')}`);
      if (parts.length === 0) {
        return lang === 'en'
          ? 'Configure Telegram Token + Chat ID or Webhook URL first.'
          : 'Сначала заполните Telegram Token + Chat ID или Webhook URL.';
      }
      return parts.join(' • ');
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  const handleVerifyMarketHistory = async (): Promise<number> => {
    setIsVerifyingMarket(true);
    try {
      const res = await fetch('/api/history/verify', { method: 'POST' });
      const data = (await res.json()) as {
        updatedCount?: number;
        entries?: ForecastHistoryEntry[];
      };
      if (Array.isArray(data.entries)) {
        setHistory(data.entries);
      }
      return data.updatedCount ?? 0;
    } catch {
      return 0;
    } finally {
      setIsVerifyingMarket(false);
    }
  };

  const handleDeleteHistoryEntry = async (id: number): Promise<void> => {
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      setHistory((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // Ignore transient delete error
    }
  };

  return (
    <div className="h-screen w-screen bg-[#0A0E17] text-[#F1F5F9] flex overflow-hidden">
      {/* Hidden video host for live stream auto-capture */}
      <video ref={liveVideoRef} className="hidden" muted playsInline />

      <Sidebar
        lang={lang}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        selectedProvider={settings.provider}
        onChangeProvider={(provider) => persistSettings({ ...settings, provider })}
        activeModels={activeModels}
        selectedModel={selectedModel}
        onChangeModel={(model) => {
          if (settings.provider === AiProviderType.Gemini) {
            persistSettings({ ...settings, geminiModel: model });
          } else if (settings.provider === AiProviderType.Claude) {
            persistSettings({ ...settings, claudeModel: model });
          } else {
            persistSettings({ ...settings, ollamaModel: model });
          }
        }}
        canChangeProvider={!isAnalyzing}
        canSelectModel={!isAnalyzing && activeModels.length > 0}
        modelSelectorHint={modelSelectorHint}
        onRefreshModels={() => void refreshOllamaStatus()}
        onRefreshConnections={() => void refreshAllConnections()}
        geminiStatus={geminiStatus}
        ollamaStatus={ollamaStatus}
        claudeStatus={claudeStatus}
      />

      {/* Main Workspace */}
      <main className="flex-1 min-w-0 px-[22px] py-[18px] flex flex-col overflow-hidden">
        {/* Top Action Header */}
        <header className="bg-[#151D2E] border border-[#25324D] rounded-[14px] px-4 py-3 mb-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {!settings.useExchangeData && (
              <>
                <div className="bg-[#101624] border border-[#25324D] rounded-[8px] px-2.5 py-1.5 text-[12.5px] text-[#94A3B8]">
                  {lang === 'en' ? 'Region: ' : 'Область: '}
                  {formatRegionBadge(settings.captureRegion, lang)}
                </div>

                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() => setIsRegionModalOpen(true)}
                  className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] hover:border-[#384E75] rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium cursor-pointer disabled:opacity-45 transition-colors"
                >
                  {t(lang, 'BtnSelectRegion')}
                </button>
              </>
            )}

            {liveStreamActive && (
              <button
                type="button"
                onClick={stopLiveStream}
                className="bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#22C55E] rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                title={lang === 'en' ? 'Click to stop live stream' : 'Нажмите, чтобы остановить поток'}
              >
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>{t(lang, 'LiveStreamActive')} ×</span>
              </button>
            )}

            {/* Forecast Horizon quick switch */}
            <div className="bg-[#101624] border border-[#25324D] rounded-[8px] p-0.5 inline-flex items-center gap-0.5 text-[12px]">
              <span className="px-2 text-[#94A3B8] inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
                {lang === 'en' ? 'Horizon:' : 'Горизонт:'}
              </span>
              {([1, 2, 4] as ForecastHorizonHours[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() => persistSettings({ ...settings, forecastHorizonHours: h })}
                  className={`px-2 py-1 rounded-[6px] font-semibold cursor-pointer transition-colors disabled:opacity-50 ${
                    settings.forecastHorizonHours === h
                      ? 'bg-[#00D4AA]/20 text-[#00D4AA]'
                      : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  {h}
                  {lang === 'en' ? 'h' : 'ч'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setActiveTab(3)}
              title={t(lang, 'NavSettings')}
              className="bg-[#101624] border border-[#25324D] hover:border-[#384E75] rounded-[8px] px-2.5 py-1.5 text-[12.5px] text-[#94A3B8] cursor-pointer transition-colors"
            >
              {t(lang, 'LabelUpdatePeriod')}:{' '}
              <strong className="text-[#00D4AA]">
                {settings.autoIntervalMinutes} {t(lang, 'MinutesShort')}
              </strong>
            </button>

            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() =>
                persistSettings({ ...settings, consensusMode: !settings.consensusMode })
              }
              className={`border rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                settings.consensusMode
                  ? 'bg-[#00D4AA]/15 border-[#00D4AA] text-[#00D4AA]'
                  : 'bg-[#101624] border-[#25324D] text-[#94A3B8] hover:border-[#384E75]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{t(lang, 'ConsensusToggleLabel')}</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            {isAnalyzing && (
              <div className="flex items-center gap-2 text-[#00D4AA] text-[12.5px]">
                <Loader2 className="w-[18px] h-[18px] animate-spin" />
                <span>{analysisStepText}</span>
              </div>
            )}

            {/* Separate Auto-Mode toggle button */}
            <button
              type="button"
              onClick={handleToggleAuto}
              className={`rounded-[10px] px-3 py-2 text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors border ${
                settings.autoModeEnabled
                  ? 'bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#FCA5A5] border-[#EF4444]/40'
                  : 'bg-[#1B263B] hover:bg-[#24334F] text-[#38BDF8] border-[#25324D] hover:border-[#38BDF8]'
              }`}
            >
              {settings.autoModeEnabled ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {t(lang, 'BtnStopAuto')}
                    {autoCountdownText ? ` (${autoCountdownText})` : ''}
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{t(lang, 'BtnStartAuto')}</span>
                </>
              )}
            </button>

            {/* One-shot Analyze button */}
            <button
              type="button"
              disabled={isAnalyzing}
              title={
                lang === 'en'
                  ? 'Run a single analysis now without changing Auto mode'
                  : 'Выполнить разовый анализ сейчас (не включает авто-таймер)'
              }
              onClick={handleAnalyzeClick}
              className="bg-[#00D4AA] hover:bg-[#22E7BF] active:scale-[0.97] text-[#071216] rounded-[10px] px-4 py-2 text-[13.5px] font-semibold min-w-[175px] cursor-pointer disabled:opacity-45 transition-all"
            >
              {isAnalyzing ? t(lang, 'BtnAnalyzing') : t(lang, 'BtnAnalyzeNow')}
            </button>
          </div>
        </header>

        {/* Error Banner */}
        {errorBannerText && (
          <div className="bg-[#EF4444]/15 border border-[#EF4444]/40 rounded-[10px] px-3.5 py-2.5 mb-3 flex items-center justify-between gap-3 shrink-0">
            <span className="text-[#FCA5A5] text-[13px]">{errorBannerText}</span>
            <button
              type="button"
              aria-label={lang === 'en' ? 'Dismiss error' : 'Закрыть ошибку'}
              onClick={() => setErrorBannerText('')}
              className="text-[#FCA5A5] hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Info Banner */}
        {infoBannerText && (
          <div className="bg-[#00D4AA]/10 border border-[#00D4AA]/30 rounded-[10px] px-3.5 py-2.5 mb-3 flex items-center justify-between gap-3 shrink-0">
            <span className="text-[#00D4AA] text-[13px]">{infoBannerText}</span>
            <button
              type="button"
              aria-label={lang === 'en' ? 'Dismiss info' : 'Закрыть уведомление'}
              onClick={() => setInfoBannerText('')}
              className="text-[#00D4AA] hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Active Screen Host */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {activeTab === 0 && (
            <ForecastView
              lang={lang}
              forecast={forecast}
              market={market}
              isLoadingMarket={isLoadingMarket}
              marketError={marketError}
              onRefreshMarket={() => void refreshMarket(true)}
              screenshotDataUrl={screenshotDataUrl}
              screenshotLabel={
                screenshotDataUrl ? formatRegionBadge(settings.captureRegion, lang) : ''
              }
              screenshotCapturedAt={screenshotCapturedAt}
              useExchangeData={settings.useExchangeData}
              autoModeEnabled={settings.autoModeEnabled}
              autoIntervalMinutes={settings.autoIntervalMinutes}
              nextAutoRunTimeText={
                nextAutoRunMs
                  ? new Date(nextAutoRunMs).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : ''
              }
              onOpenRegionModal={() => setIsRegionModalOpen(true)}
              onImageFileDropped={handleImageFileDropped}
            />
          )}

          {activeTab === 1 && (
            <NewsView
              lang={lang}
              items={newsItems}
              lastUpdatedText={newsLastUpdated}
              isLoading={isLoadingNews}
              errorMessage={newsError}
              rssFeeds={settings.rssFeeds}
              newsKeywords={settings.newsKeywords}
              onRefreshNews={() => void refreshNews()}
              onOpenSettings={() => setActiveTab(3)}
            />
          )}

          {activeTab === 2 && (
            <HistoryView
              lang={lang}
              entries={history}
              isVerifyingMarket={isVerifyingMarket}
              onRefreshHistory={() => void fetchServerHistory()}
              onVerifyMarket={handleVerifyMarketHistory}
              onDeleteEntry={handleDeleteHistoryEntry}
            />
          )}

          {activeTab === 3 && (
            <SettingsView
              lang={lang}
              settings={settings}
              availableOllamaModels={availableOllamaModels}
              geminiStatus={geminiStatus}
              ollamaStatus={ollamaStatus}
              claudeStatus={claudeStatus}
              isCheckingOllama={isCheckingOllama}
              isCheckingClaude={isCheckingClaude}
              ollamaModelsHint={
                !ollamaStatus.isConnected
                  ? ollamaStatus.hintMessage || t(lang, 'OllamaOfflineHint')
                  : availableOllamaModels.length === 0
                  ? t(lang, 'NoOllamaModelsShort')
                  : ''
              }
              onSaveSettings={handleSaveSettings}
              onOpenRegionModal={() => setIsRegionModalOpen(true)}
              onRefreshOllamaModels={(url) => void refreshOllamaStatus(url)}
              onTestClaudeConnection={(key) => void refreshClaudeStatus(key)}
              onCheckUpdates={handleCheckUpdates}
              onTestAlert={handleTestAlert}
            />
          )}
        </div>
      </main>

      <RegionSelectionModal
        lang={lang}
        isOpen={isRegionModalOpen}
        initialImageUrl={screenshotDataUrl}
        onClose={() => setIsRegionModalOpen(false)}
        onApply={(dataUrl, region, liveMeta) => {
          stopLiveStream();
          if (liveMeta && liveVideoRef.current) {
            liveStreamRef.current = liveMeta.stream;
            liveCropRef.current = liveMeta.cropNormalized;
            liveVideoRef.current.srcObject = liveMeta.stream;
            void liveVideoRef.current.play();
            setLiveStreamActive(true);
            const track = liveMeta.stream.getVideoTracks()[0];
            if (track) {
              track.onended = () => {
                stopLiveStream();
              };
            }
          }

          setScreenshotDataUrl(dataUrl);
          setScreenshotCapturedAt(new Date().toISOString());
          const next = { ...settings, captureRegion: region };
          persistSettings(next);
          setErrorBannerText('');
          setInfoBannerText(
            lang === 'en'
              ? `Screenshot region saved: ${formatRegionBadge(region, lang)}`
              : `Область скриншота сохранена: ${formatRegionBadge(region, lang)}`
          );
        }}
      />
    </div>
  );
}
