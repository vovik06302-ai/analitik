import React, { useState } from 'react';
import {
  AiProviderType,
  APP_VERSION,
  AppSettings,
  DEFAULT_CLAUDE_MODELS,
  DEFAULT_GEMINI_MODELS,
  DEFAULT_NEWS_KEYWORDS,
  DEFAULT_RSS_FEEDS,
  ProviderStatus,
  ServiceConnectionState,
} from '../types';
import { Language, t } from '../i18n/translations';
import { formatRegionBadge } from '../utils/forecast';

interface SettingsViewProps {
  lang: Language;
  settings: AppSettings;
  availableOllamaModels: string[];
  geminiStatus: ProviderStatus;
  ollamaStatus: ProviderStatus;
  claudeStatus: ProviderStatus;
  isCheckingOllama: boolean;
  isCheckingClaude: boolean;
  ollamaModelsHint: string;
  onSaveSettings: (next: AppSettings) => void;
  onOpenRegionModal: () => void;
  onRefreshOllamaModels: (ollamaUrl: string) => void;
  onTestClaudeConnection: (apiKey: string) => void;
  onCheckUpdates: () => Promise<string>;
  onTestAlert: (draftSettings: AppSettings) => Promise<string>;
}

function getConnColor(state: ServiceConnectionState): string {
  switch (state) {
    case ServiceConnectionState.Connected:
      return '#22C55E';
    case ServiceConnectionState.NotConfigured:
      return '#F59E0B';
    case ServiceConnectionState.Checking:
      return '#38BDF8';
    default:
      return '#EF4444';
  }
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  lang,
  settings,
  availableOllamaModels,
  geminiStatus,
  ollamaStatus,
  claudeStatus,
  isCheckingOllama,
  isCheckingClaude,
  ollamaModelsHint,
  onSaveSettings,
  onOpenRegionModal,
  onRefreshOllamaModels,
  onTestClaudeConnection,
  onCheckUpdates,
  onTestAlert,
}) => {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [newKeyword, setNewKeyword] = useState('');
  const [newRssUrl, setNewRssUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isTestingAlert, setIsTestingAlert] = useState(false);

  React.useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const handleAddKeyword = () => {
    const kw = newKeyword.trim();
    if (!kw) return;
    if (!draft.newsKeywords.some((k) => k.toLowerCase() === kw.toLowerCase())) {
      setDraft({ ...draft, newsKeywords: [...draft.newsKeywords, kw] });
    }
    setNewKeyword('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setDraft({
      ...draft,
      newsKeywords: draft.newsKeywords.filter((k) => k !== kw),
    });
  };

  const handleAddRss = () => {
    const url = newRssUrl.trim();
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setStatusMessage(
          lang === 'en'
            ? 'Enter a valid http/https RSS feed URL.'
            : 'Введите корректный http/https адрес RSS-ленты.'
        );
        return;
      }
    } catch {
      setStatusMessage(
        lang === 'en'
          ? 'Enter a valid http/https RSS feed URL.'
          : 'Введите корректный http/https адрес RSS-ленты.'
      );
      return;
    }

    if (!draft.rssFeeds.some((f) => f.toLowerCase() === url.toLowerCase())) {
      setDraft({ ...draft, rssFeeds: [...draft.rssFeeds, url] });
    }
    setNewRssUrl('');
    setStatusMessage('');
  };

  const handleRemoveRss = (url: string) => {
    setDraft({
      ...draft,
      rssFeeds: draft.rssFeeds.filter((f) => f !== url),
    });
  };

  const handleSave = () => {
    const clampedInterval = Math.max(1, Math.min(1440, Number(draft.autoIntervalMinutes) || 15));
    const clampedThreshold = Math.max(0, Math.min(100, Number(draft.notifyConfidenceThreshold) || 70));
    const next: AppSettings = {
      ...draft,
      autoIntervalMinutes: clampedInterval,
      notifyConfidenceThreshold: clampedThreshold,
      ollamaUrl: draft.ollamaUrl.trim() || 'http://localhost:11434',
      ollamaModel: draft.ollamaModel.trim() || 'qwen2.5vl:32b',
      claudeModel: draft.claudeModel.trim() || 'claude-sonnet-4-20250514',
      geminiModel: draft.geminiModel.trim() || 'gemini-4-hydrogen',
      telegramBotToken: draft.telegramBotToken.trim(),
      telegramChatId: draft.telegramChatId.trim(),
      webhookUrl: draft.webhookUrl.trim(),
      newsKeywords:
        draft.newsKeywords.length > 0 ? draft.newsKeywords : [...DEFAULT_NEWS_KEYWORDS],
    };
    onSaveSettings(next);
    setStatusMessage(t(next.language, 'SettingsSaved'));
  };

  const handleCheckUpdatesClick = async () => {
    const msg = await onCheckUpdates();
    setStatusMessage(msg);
  };

  const handleTestAlertClick = async () => {
    setIsTestingAlert(true);
    try {
      const msg = await onTestAlert(draft);
      setStatusMessage(msg);
    } finally {
      setIsTestingAlert(false);
    }
  };

  return (
    <div className="space-y-3.5 pb-6">
      {/* Capture & Schedule */}
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-[18px] animate-card-enter">
        <h3 className="text-[15.5px] font-bold text-[#00D4AA] mb-3.5">
          {t(lang, 'SettingsSectionCapture')}
        </h3>

        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <div className="text-[12px] text-[#94A3B8]">{t(lang, 'LabelRegion')}</div>
            <div className="text-[14px] font-semibold text-[#F1F5F9] mt-0.5">
              {formatRegionBadge(draft.captureRegion, lang)}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenRegionModal}
            className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] hover:border-[#384E75] rounded-[10px] px-3.5 py-2 text-[13px] font-medium cursor-pointer transition-colors"
          >
            {t(lang, 'BtnSelectRegion')}
          </button>
        </div>

        <label className="flex items-center gap-2.5 text-[13px] text-[#F1F5F9] cursor-pointer mb-1">
          <input
            type="checkbox"
            checked={draft.useExchangeData}
            onChange={(e) => setDraft({ ...draft, useExchangeData: e.target.checked })}
            className="w-4 h-4 accent-[#00D4AA] rounded cursor-pointer"
          />
          <span>
            {lang === 'en'
              ? 'Take data from the SafeTrade exchange (no screenshot needed)'
              : 'Брать данные с биржи SafeTrade (скриншот не нужен)'}
          </span>
        </label>
        <div className="text-[11.5px] text-[#94A3B8] mb-3 ml-[26px]">
          {lang === 'en'
            ? 'Candles, price, volume and order book come straight from the exchange API. Turn off to analyze a screenshot instead.'
            : 'Свечи, цена, объём и стакан берутся напрямую с биржи. Выключите, чтобы анализировать скриншот графика.'}
        </div>

        <label className="flex items-center gap-2.5 text-[13px] text-[#F1F5F9] cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={draft.autoModeEnabled}
            onChange={(e) => setDraft({ ...draft, autoModeEnabled: e.target.checked })}
            className="w-4 h-4 accent-[#00D4AA] rounded cursor-pointer"
          />
          <span>{t(lang, 'SettingsAutoEnabled')}</span>
        </label>

        <div className="text-[12px] text-[#94A3B8] mb-1.5">
          {t(lang, 'SettingsIntervalLabel')}
        </div>
        <input
          type="number"
          min={1}
          max={1440}
          value={draft.autoIntervalMinutes}
          onChange={(e) =>
            setDraft({ ...draft, autoIntervalMinutes: Number(e.target.value) || 1 })
          }
          className="w-[140px] bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
        />
      </div>

      {/* AI Provider */}
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-[18px] animate-card-enter">
        <h3 className="text-[15.5px] font-bold text-[#00D4AA] mb-3.5">
          {t(lang, 'SettingsSectionAi')}
        </h3>

        <label className="flex items-center gap-2.5 text-[13px] text-[#F1F5F9] cursor-pointer mb-3.5">
          <input
            type="checkbox"
            checked={draft.consensusMode}
            onChange={(e) => setDraft({ ...draft, consensusMode: e.target.checked })}
            className="w-4 h-4 accent-[#00D4AA] rounded cursor-pointer"
          />
          <span>{t(lang, 'ConsensusToggleLabel')}</span>
        </label>

        <div className="text-[12px] text-[#94A3B8] mb-1.5">
          {t(lang, 'SettingsProviderLabel')}
        </div>
        <select
          value={draft.provider}
          onChange={(e) =>
            setDraft({ ...draft, provider: e.target.value as AiProviderType })
          }
          className="w-[220px] bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] mb-3.5 focus:outline-none"
        >
          <option value={AiProviderType.Gemini}>Gemini</option>
          <option value={AiProviderType.Ollama}>Ollama</option>
          <option value={AiProviderType.Claude}>Claude</option>
        </select>

        {/* Gemini Settings */}
        {draft.provider === AiProviderType.Gemini && (
          <div className="space-y-3">
            <div
              title={geminiStatus.troubleshootingTooltip}
              className="bg-[#0E1420] border border-[#25324D] rounded-[8px] px-3 py-2 flex items-center gap-2"
            >
              <span
                className="w-[9px] h-[9px] rounded-full shrink-0"
                style={{ backgroundColor: getConnColor(geminiStatus.state) }}
              />
              <span className="text-[12.5px] font-semibold text-[#F1F5F9] flex-1">
                {geminiStatus.statusMessage}
              </span>
              <span className="w-[18px] h-[18px] rounded-full bg-[#1B263B] border border-[#25324D] text-[11px] font-bold text-[#94A3B8] flex items-center justify-center">
                ?
              </span>
            </div>

            <div>
              <div className="text-[12px] text-[#94A3B8] mb-1.5">
                {t(lang, 'SettingsGeminiModel')}
              </div>
              <select
                value={draft.geminiModel}
                onChange={(e) => setDraft({ ...draft, geminiModel: e.target.value })}
                className="w-full bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
              >
                {DEFAULT_GEMINI_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Ollama Settings */}
        {draft.provider === AiProviderType.Ollama && (
          <div className="space-y-3">
            <div
              title={ollamaStatus.troubleshootingTooltip}
              className="bg-[#0E1420] border border-[#25324D] rounded-[8px] px-3 py-2 flex items-center gap-2"
            >
              <span
                className="w-[9px] h-[9px] rounded-full shrink-0"
                style={{ backgroundColor: getConnColor(ollamaStatus.state) }}
              />
              <span className="text-[12.5px] font-semibold text-[#F1F5F9] flex-1">
                {ollamaStatus.statusMessage}
              </span>
              <span className="w-[18px] h-[18px] rounded-full bg-[#1B263B] border border-[#25324D] text-[11px] font-bold text-[#94A3B8] flex items-center justify-center">
                ?
              </span>
            </div>

            <div>
              <div className="text-[12px] text-[#94A3B8] mb-1.5">
                {t(lang, 'SettingsOllamaUrl')}
              </div>
              <input
                type="text"
                value={draft.ollamaUrl}
                onChange={(e) => setDraft({ ...draft, ollamaUrl: e.target.value })}
                className="w-full bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
              />
            </div>

            <div>
              <div className="text-[12px] text-[#94A3B8] mb-1.5">
                {t(lang, 'SettingsOllamaModel')}
              </div>
              <div className="flex gap-2.5">
                <select
                  value={
                    availableOllamaModels.includes(draft.ollamaModel)
                      ? draft.ollamaModel
                      : ''
                  }
                  onChange={(e) => {
                    if (e.target.value) {
                      setDraft({ ...draft, ollamaModel: e.target.value });
                    }
                  }}
                  className="flex-1 bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
                >
                  {availableOllamaModels.length === 0 ? (
                    <option value="">{t(lang, 'NoData')}</option>
                  ) : (
                    availableOllamaModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  disabled={isCheckingOllama}
                  onClick={() => onRefreshOllamaModels(draft.ollamaUrl)}
                  title={t(lang, 'BtnRefreshModelsTooltip')}
                  className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[10px] px-3.5 py-2 text-[13px] font-medium cursor-pointer disabled:opacity-45"
                >
                  {t(lang, 'BtnRefreshModels')}
                </button>
              </div>
            </div>

            <div>
              <div className="text-[12px] text-[#94A3B8] mb-1.5">
                {t(lang, 'SettingsOllamaModelManual')}
              </div>
              <input
                type="text"
                value={draft.ollamaModel}
                onChange={(e) => setDraft({ ...draft, ollamaModel: e.target.value })}
                className="w-full bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
              />
            </div>

            {ollamaModelsHint && (
              <p className="text-[12px] text-[#F59E0B]">{ollamaModelsHint}</p>
            )}
          </div>
        )}

        {/* Claude Settings */}
        {draft.provider === AiProviderType.Claude && (
          <div className="space-y-3">
            <div
              title={claudeStatus.troubleshootingTooltip}
              className="bg-[#0E1420] border border-[#25324D] rounded-[8px] px-3 py-2 flex items-center gap-2"
            >
              <span
                className="w-[9px] h-[9px] rounded-full shrink-0"
                style={{ backgroundColor: getConnColor(claudeStatus.state) }}
              />
              <span className="text-[12.5px] font-semibold text-[#F1F5F9] flex-1">
                {claudeStatus.statusMessage}
              </span>
              <span className="w-[18px] h-[18px] rounded-full bg-[#1B263B] border border-[#25324D] text-[11px] font-bold text-[#94A3B8] flex items-center justify-center">
                ?
              </span>
              <button
                type="button"
                disabled={isCheckingClaude}
                onClick={() => onTestClaudeConnection(draft.claudeApiKey)}
                className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[8px] px-2.5 py-1 text-[12px] font-medium cursor-pointer disabled:opacity-45"
              >
                {t(lang, 'BtnTestConnection')}
              </button>
            </div>

            <div>
              <div className="text-[12px] text-[#94A3B8] mb-1.5">
                {t(lang, 'SettingsClaudeKey')}
              </div>
              <input
                type="password"
                value={draft.claudeApiKey}
                onChange={(e) => setDraft({ ...draft, claudeApiKey: e.target.value })}
                placeholder="sk-ant-..."
                className="w-full bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
              />
            </div>

            <div>
              <div className="text-[12px] text-[#94A3B8] mb-1.5">
                {t(lang, 'SettingsClaudeModel')}
              </div>
              <select
                value={
                  DEFAULT_CLAUDE_MODELS.includes(draft.claudeModel) ? draft.claudeModel : ''
                }
                onChange={(e) => {
                  if (e.target.value) {
                    setDraft({ ...draft, claudeModel: e.target.value });
                  }
                }}
                className="w-full bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
              >
                {DEFAULT_CLAUDE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[12px] text-[#94A3B8] mb-1.5">
                {t(lang, 'SettingsClaudeModelManual')}
              </div>
              <input
                type="text"
                value={draft.claudeModel}
                onChange={(e) => setDraft({ ...draft, claudeModel: e.target.value })}
                className="w-full bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* News Sources */}
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-[18px] animate-card-enter">
        <h3 className="text-[15.5px] font-bold text-[#00D4AA] mb-3.5">
          {t(lang, 'SettingsSectionNews')}
        </h3>

        <div className="text-[12px] text-[#94A3B8] mb-1.5">
          {t(lang, 'KeywordsLabel')}
        </div>
        <div className="flex gap-2.5 mb-2.5">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
            className="flex-1 bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddKeyword}
            className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[10px] px-3.5 py-2 text-[13px] font-medium cursor-pointer"
          >
            {t(lang, 'BtnAdd')}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {draft.newsKeywords.map((kw) => (
            <span
              key={kw}
              className="bg-[#1B263B] border border-[#25324D] rounded-[8px] px-2.5 py-1 text-[12.5px] text-[#F1F5F9] inline-flex items-center gap-2"
            >
              <span>{kw}</span>
              <button
                type="button"
                aria-label={`${t(lang, 'BtnDelete')} ${kw}`}
                onClick={() => handleRemoveKeyword(kw)}
                className="text-[#94A3B8] hover:text-[#F1F5F9] cursor-pointer"
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[12px] text-[#94A3B8]">
            {t(lang, 'RssFeedsLabel')}
          </div>
          <button
            type="button"
            onClick={() => setDraft({ ...draft, rssFeeds: [...DEFAULT_RSS_FEEDS] })}
            className="text-[12px] text-[#38BDF8] hover:text-[#7DD3FC] cursor-pointer"
          >
            {t(lang, 'BtnRestoreDefaultFeeds')}
          </button>
        </div>
        <div className="flex gap-2.5 mb-2.5">
          <input
            type="url"
            value={newRssUrl}
            onChange={(e) => setNewRssUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddRss()}
            placeholder="https://..."
            className="flex-1 bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddRss}
            className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[10px] px-3.5 py-2 text-[13px] font-medium cursor-pointer"
          >
            {t(lang, 'BtnAddRss')}
          </button>
        </div>

        <div className="space-y-1.5">
          {draft.rssFeeds.map((feed) => (
            <div
              key={feed}
              className="bg-[#0E1420] border border-[#25324D] rounded-[8px] px-2.5 py-1.5 flex items-center justify-between gap-3"
            >
              <span className="text-[12.5px] text-[#F1F5F9] truncate">{feed}</span>
              <button
                type="button"
                onClick={() => handleRemoveRss(feed)}
                className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[8px] px-2.5 py-1 text-[11.5px] cursor-pointer shrink-0"
              >
                {t(lang, 'BtnDelete')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications, Telegram/Webhook & Updates */}
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-[18px] animate-card-enter">
        <h3 className="text-[15.5px] font-bold text-[#00D4AA] mb-3.5">
          {t(lang, 'SettingsSectionNotifications')}
        </h3>

        <label className="flex items-center gap-2.5 text-[13px] text-[#F1F5F9] cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={draft.notifyOnDirectionChange}
            onChange={(e) =>
              setDraft({ ...draft, notifyOnDirectionChange: e.target.checked })
            }
            className="w-4 h-4 accent-[#00D4AA] rounded cursor-pointer"
          />
          <span>{t(lang, 'SettingsNotifyDirection')}</span>
        </label>

        <div className="text-[12px] text-[#94A3B8] mb-1.5">
          {t(lang, 'SettingsNotifyThreshold')}
        </div>
        <input
          type="number"
          min={0}
          max={100}
          value={draft.notifyConfidenceThreshold}
          onChange={(e) =>
            setDraft({
              ...draft,
              notifyConfidenceThreshold: Number(e.target.value) || 0,
            })
          }
          className="w-[120px] bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] mb-3.5 focus:outline-none"
        />

        <label className="flex items-center gap-2.5 text-[13px] text-[#F1F5F9] cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={draft.minimizeToTrayOnClose}
            onChange={(e) =>
              setDraft({ ...draft, minimizeToTrayOnClose: e.target.checked })
            }
            className="w-4 h-4 accent-[#00D4AA] rounded cursor-pointer"
          />
          <span>{t(lang, 'SettingsMinimizeToTray')}</span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-[12px] text-[#94A3B8] mb-1.5">
              {t(lang, 'TelegramBotTokenLabel')}
            </div>
            <input
              type="password"
              value={draft.telegramBotToken}
              onChange={(e) => setDraft({ ...draft, telegramBotToken: e.target.value })}
              placeholder="123456:ABC-DEF..."
              className="w-full bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
            />
          </div>
          <div>
            <div className="text-[12px] text-[#94A3B8] mb-1.5">
              {t(lang, 'TelegramChatIdLabel')}
            </div>
            <input
              type="text"
              value={draft.telegramChatId}
              onChange={(e) => setDraft({ ...draft, telegramChatId: e.target.value })}
              placeholder="-1001234567890"
              className="w-full bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-3.5">
          <div className="text-[12px] text-[#94A3B8] mb-1.5">
            {t(lang, 'WebhookUrlLabel')}
          </div>
          <div className="flex flex-wrap gap-2.5">
            <input
              type="url"
              value={draft.webhookUrl}
              onChange={(e) => setDraft({ ...draft, webhookUrl: e.target.value })}
              placeholder="https://discord.com/api/webhooks/..."
              className="flex-1 min-w-[220px] bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] focus:outline-none"
            />
            <button
              type="button"
              disabled={isTestingAlert}
              onClick={() => void handleTestAlertClick()}
              className="bg-[#1B263B] hover:bg-[#24334F] text-[#38BDF8] border border-[#25324D] hover:border-[#38BDF8] rounded-[10px] px-3.5 py-2 text-[13px] font-medium cursor-pointer disabled:opacity-50"
            >
              {t(lang, 'BtnTestAlert')}
            </button>
          </div>
        </div>

        <div className="text-[12px] text-[#94A3B8] mb-1.5">
          {t(lang, 'SettingsLanguage')}
        </div>
        <select
          value={draft.language}
          onChange={(e) =>
            setDraft({ ...draft, language: e.target.value === 'en' ? 'en' : 'ru' })
          }
          className="w-[140px] bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] focus:border-[#00D4AA] rounded-[8px] px-2.5 py-2 text-[13px] mb-4 focus:outline-none"
        >
          <option value="ru">ru</option>
          <option value="en">en</option>
        </select>

        <div className="h-[1px] bg-[#25324D] my-3.5" />

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[12px] text-[#94A3B8]">{t(lang, 'LabelVersion')}</div>
            <div className="text-[15px] font-bold text-[#00D4AA]">v{APP_VERSION}</div>
          </div>
          <button
            type="button"
            onClick={() => void handleCheckUpdatesClick()}
            className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[10px] px-3.5 py-2 text-[13px] font-medium cursor-pointer"
          >
            {t(lang, 'BtnCheckUpdates')}
          </button>
        </div>
      </div>

      {/* Save Footer */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-[13px] text-[#00D4AA]">{statusMessage}</span>
        <button
          type="button"
          onClick={handleSave}
          className="bg-[#00D4AA] hover:bg-[#22E7BF] text-[#071216] rounded-[10px] px-5 py-2.5 text-[13.5px] font-semibold min-w-[190px] cursor-pointer transition-colors"
        >
          {t(lang, 'BtnSaveSettings')}
        </button>
      </div>
    </div>
  );
};
