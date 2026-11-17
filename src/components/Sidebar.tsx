import React from 'react';
import { RefreshCw } from 'lucide-react';
import {
  AiProviderType,
  APP_VERSION,
  ProviderStatus,
  ServiceConnectionState,
} from '../types';
import { Language, t } from '../i18n/translations';

interface SidebarProps {
  lang: Language;
  activeTab: number;
  onSelectTab: (tab: number) => void;
  selectedProvider: AiProviderType;
  onChangeProvider: (provider: AiProviderType) => void;
  activeModels: string[];
  selectedModel: string;
  onChangeModel: (model: string) => void;
  canChangeProvider: boolean;
  canSelectModel: boolean;
  modelSelectorHint: string;
  onRefreshModels: () => void;
  onRefreshConnections: () => void;
  geminiStatus: ProviderStatus;
  ollamaStatus: ProviderStatus;
  claudeStatus: ProviderStatus;
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

export const Sidebar: React.FC<SidebarProps> = ({
  lang,
  activeTab,
  onSelectTab,
  selectedProvider,
  onChangeProvider,
  activeModels,
  selectedModel,
  onChangeModel,
  canChangeProvider,
  canSelectModel,
  modelSelectorHint,
  onRefreshModels,
  onRefreshConnections,
  geminiStatus,
  ollamaStatus,
  claudeStatus,
}) => {
  const navItems = [
    { index: 0, label: t(lang, 'NavForecast') },
    { index: 1, label: t(lang, 'NavNews') },
    { index: 2, label: t(lang, 'NavHistory') },
    { index: 3, label: t(lang, 'NavSettings') },
  ];

  const providers = [AiProviderType.Gemini, AiProviderType.Ollama, AiProviderType.Claude];

  return (
    <aside className="w-[244px] shrink-0 bg-[#101624] border-r border-[#25324D] px-4 py-5 flex flex-col justify-between select-none">
      <div>
        {/* App Brand */}
        <div className="flex items-center gap-2.5 px-1 mb-6">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-[#00D4AA]/10 border border-[#00D4AA] flex items-center justify-center shrink-0">
            <div className="w-3 h-3 rounded-full bg-[#00D4AA] animate-pearl-pulse" />
          </div>
          <div className="min-w-0">
            <div className="text-[16px] font-bold text-[#F1F5F9] leading-tight truncate">
              {t(lang, 'AppTitle')}
            </div>
            <div className="text-[11px] font-semibold text-[#00D4AA] leading-tight mt-0.5 truncate">
              {t(lang, 'SubtitlePair')}
            </div>
          </div>
        </div>

        {/* Nav Tabs */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const isActive = activeTab === item.index;
            return (
              <button
                key={item.index}
                type="button"
                onClick={() => onSelectTab(item.index)}
                className={`w-full flex items-center text-left px-3.5 py-2.5 rounded-[10px] text-[14px] transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#1A263C] text-[#00D4AA] font-semibold'
                    : 'text-[#94A3B8] hover:bg-[#162033] hover:text-[#F1F5F9] font-medium'
                }`}
              >
                <span
                  className={`w-[3px] h-[18px] rounded-[2px] bg-[#00D4AA] mr-2.5 transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Model Selector, Status & Version */}
      <div className="space-y-2.5 mt-4">
        {/* Provider & Model Card */}
        <div className="bg-[#151D2E] border border-[#25324D] rounded-[12px] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-[#94A3B8]">
              {t(lang, 'SidebarModelSection')}
            </span>
            <button
              type="button"
              onClick={onRefreshModels}
              title={t(lang, 'BtnRefreshModelsTooltip')}
              className="text-[#94A3B8] hover:text-[#F1F5F9] p-0.5 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <select
            value={selectedProvider}
            disabled={!canChangeProvider}
            onChange={(e) => onChangeProvider(e.target.value as AiProviderType)}
            className="w-full bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] rounded-[8px] px-2.5 py-1.5 text-[13px] mb-2 focus:outline-none focus:border-[#00D4AA] disabled:opacity-50"
          >
            {providers.map((p) => (
              <option key={p} value={p} className="bg-[#151D2E] text-[#F1F5F9]">
                {p}
              </option>
            ))}
          </select>

          <select
            value={selectedModel}
            disabled={!canSelectModel}
            title={selectedModel}
            onChange={(e) => onChangeModel(e.target.value)}
            className="w-full bg-[#0E1420] text-[#F1F5F9] border border-[#25324D] rounded-[8px] px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#00D4AA] disabled:opacity-50 truncate"
          >
            {activeModels.length === 0 ? (
              <option value="">{t(lang, 'NoData')}</option>
            ) : (
              activeModels.map((m) => (
                <option key={m} value={m} className="bg-[#151D2E] text-[#F1F5F9]">
                  {m}
                </option>
              ))
            )}
          </select>

          {modelSelectorHint && (
            <p className="text-[#F59E0B] text-[11px] leading-snug mt-1.5 break-words">
              {modelSelectorHint}
            </p>
          )}
        </div>

        {/* Connections Status Card */}
        <div className="bg-[#151D2E] border border-[#25324D] rounded-[12px] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-[#94A3B8]">
              {t(lang, 'ConnectionStatusHeader')}
            </span>
            <button
              type="button"
              onClick={onRefreshConnections}
              title={t(lang, 'BtnRefreshConnectionsTooltip')}
              className="text-[#94A3B8] hover:text-[#F1F5F9] p-0.5 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1.5">
            {[geminiStatus, ollamaStatus, claudeStatus].map((st, idx) => (
              <div
                key={idx}
                title={st.troubleshootingTooltip}
                className="flex items-center gap-2"
              >
                <span
                  className="w-[9px] h-[9px] rounded-full shrink-0"
                  style={{ backgroundColor: getConnColor(st.state) }}
                />
                <span className="text-[12px] font-semibold text-[#F1F5F9] truncate flex-1">
                  {st.statusMessage}
                </span>
                <span className="w-4 h-4 rounded-full bg-[#1B263B] border border-[#25324D] text-[10px] font-bold text-[#94A3B8] flex items-center justify-center shrink-0">
                  ?
                </span>
              </div>
            ))}
          </div>

          {selectedProvider === AiProviderType.Ollama &&
            !ollamaStatus.isConnected &&
            ollamaStatus.hintMessage && (
              <p className="text-[#F59E0B] text-[11px] leading-snug mt-2 break-words">
                {ollamaStatus.hintMessage}
              </p>
            )}
        </div>

        <div className="text-center text-[11.5px] text-[#64748B]">v{APP_VERSION}</div>
      </div>
    </aside>
  );
};
