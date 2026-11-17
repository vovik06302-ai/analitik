import React, { useMemo, useState } from 'react';
import { ExternalLink, Filter, Rss } from 'lucide-react';
import { NewsItem, NewsRelevance, NewsSentiment } from '../types';
import { Language, t } from '../i18n/translations';

interface NewsViewProps {
  lang: Language;
  items: NewsItem[];
  lastUpdatedText: string;
  isLoading: boolean;
  errorMessage: string;
  rssFeeds: string[];
  newsKeywords: string[];
  onRefreshNews: () => void;
  onOpenSettings: () => void;
}

type FreshnessFilter = 'all' | '24h' | '48h';
type RelevanceFilter = 'all' | NewsRelevance;
type SentimentFilter = 'all' | NewsSentiment;

export const NewsView: React.FC<NewsViewProps> = ({
  lang,
  items,
  lastUpdatedText,
  isLoading,
  errorMessage,
  rssFeeds,
  newsKeywords,
  onRefreshNews,
  onOpenSettings,
}) => {
  const [freshness, setFreshness] = useState<FreshnessFilter>('all');
  const [relevanceFilter, setRelevanceFilter] = useState<RelevanceFilter>('all');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all');

  const filteredItems = useMemo(() => {
    const nowMs = Date.now();
    return items.filter((item) => {
      if (freshness !== 'all' && item.publishedAt) {
        const ageHrs = (nowMs - new Date(item.publishedAt).getTime()) / 3_600_000;
        if (freshness === '24h' && ageHrs > 24) return false;
        if (freshness === '48h' && ageHrs > 48) return false;
      }
      if (relevanceFilter !== 'all' && (item.relevance ?? 'CryptoMarket') !== relevanceFilter) {
        return false;
      }
      if (sentimentFilter !== 'all' && (item.sentiment ?? 'Neutral') !== sentimentFilter) {
        return false;
      }
      return true;
    });
  }, [items, freshness, relevanceFilter, sentimentFilter]);

  const directCount = useMemo(
    () => items.filter((i) => i.relevance === 'DirectPearl').length,
    [items]
  );

  const filterBtnClass = (active: boolean) =>
    `rounded-[8px] px-2.5 py-1 text-[12px] font-medium border cursor-pointer transition-colors ${
      active
        ? 'bg-[#00D4AA]/15 border-[#00D4AA] text-[#00D4AA]'
        : 'bg-[#0E1420] border-[#25324D] text-[#94A3B8] hover:text-[#F1F5F9] hover:border-[#384E75]'
    }`;

  const sentimentBadge = (sentiment?: NewsSentiment) => {
    if (sentiment === 'Bullish') {
      return (
        <span className="bg-[#22C55E]/15 text-[#22C55E] rounded-[6px] px-2 py-0.5 text-[11px] font-semibold">
          {lang === 'en' ? 'Bullish' : 'Бычий'}
        </span>
      );
    }
    if (sentiment === 'Bearish') {
      return (
        <span className="bg-[#EF4444]/15 text-[#EF4444] rounded-[6px] px-2 py-0.5 text-[11px] font-semibold">
          {lang === 'en' ? 'Bearish' : 'Медвежий'}
        </span>
      );
    }
    return (
      <span className="bg-[#64748B]/15 text-[#94A3B8] rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
        {lang === 'en' ? 'Neutral' : 'Нейтральный'}
      </span>
    );
  };

  return (
    <div className="space-y-3.5 pb-6">
      {/* Toolbar */}
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] px-4 py-3 flex items-center justify-between gap-3 animate-card-enter">
        <div>
          <h2 className="text-[17px] font-bold text-[#F1F5F9]">{t(lang, 'NavNews')}</h2>
          <p className="text-[12px] text-[#94A3B8]">
            {t(lang, 'LabelUpdated')}: {lastUpdatedText} •{' '}
            {lang === 'en'
              ? `Shown ${filteredItems.length} of ${items.length}`
              : `Показано ${filteredItems.length} из ${items.length}`}
          </p>
        </div>

        <button
          type="button"
          onClick={onRefreshNews}
          disabled={isLoading}
          className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] hover:border-[#384E75] rounded-[10px] px-3.5 py-2 text-[13px] font-medium cursor-pointer disabled:opacity-45 transition-colors"
        >
          {t(lang, 'BtnRefreshNews')}
        </button>
      </div>

      {/* News Radar Filter Bar */}
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-3.5 flex flex-wrap items-center gap-3 animate-card-enter">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#94A3B8]">
          <Filter className="w-3.5 h-3.5 text-[#00D4AA]" />
          <span>{lang === 'en' ? 'News Radar:' : 'Радар новостей:'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFreshness('all')}
            className={filterBtnClass(freshness === 'all')}
          >
            {lang === 'en' ? 'All time' : 'Всё время'}
          </button>
          <button
            type="button"
            onClick={() => setFreshness('24h')}
            className={filterBtnClass(freshness === '24h')}
          >
            24h
          </button>
          <button
            type="button"
            onClick={() => setFreshness('48h')}
            className={filterBtnClass(freshness === '48h')}
          >
            48h
          </button>
        </div>

        <div className="h-4 w-[1px] bg-[#25324D] hidden sm:block" />

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRelevanceFilter('all')}
            className={filterBtnClass(relevanceFilter === 'all')}
          >
            {lang === 'en' ? 'All topics' : 'Все темы'}
          </button>
          <button
            type="button"
            onClick={() => setRelevanceFilter('DirectPearl')}
            className={filterBtnClass(relevanceFilter === 'DirectPearl')}
          >
            {lang === 'en' ? `PEARL / SafeTrade (${directCount})` : `PEARL / SafeTrade (${directCount})`}
          </button>
        </div>

        <div className="h-4 w-[1px] bg-[#25324D] hidden sm:block" />

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSentimentFilter('all')}
            className={filterBtnClass(sentimentFilter === 'all')}
          >
            {lang === 'en' ? 'Any sentiment' : 'Любой тон'}
          </button>
          <button
            type="button"
            onClick={() => setSentimentFilter('Bullish')}
            className={filterBtnClass(sentimentFilter === 'Bullish')}
          >
            {lang === 'en' ? 'Bullish' : 'Бычьи'}
          </button>
          <button
            type="button"
            onClick={() => setSentimentFilter('Bearish')}
            className={filterBtnClass(sentimentFilter === 'Bearish')}
          >
            {lang === 'en' ? 'Bearish' : 'Медвежьи'}
          </button>
        </div>
      </div>

      {/* Active News Sources Card */}
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-4 animate-card-enter">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2">
            <Rss className="w-4 h-4 text-[#00D4AA]" />
            <h3 className="text-[13.5px] font-semibold text-[#F1F5F9]">
              {t(lang, 'NewsSourcesTitle')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-[12px] text-[#38BDF8] hover:text-[#7DD3FC] cursor-pointer"
          >
            {t(lang, 'NavSettings')} →
          </button>
        </div>

        <div className="space-y-2">
          {rssFeeds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rssFeeds.map((feed) => {
                let host = feed;
                try {
                  host = new URL(feed).hostname.replace(/^www\./, '');
                } catch {
                  // Keep raw URL if unparseable
                }
                return (
                  <a
                    key={feed}
                    href={feed}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={feed}
                    className="bg-[#0E1420] hover:bg-[#1B263B] border border-[#25324D] hover:border-[#38BDF8] rounded-[8px] px-2.5 py-1 text-[12px] text-[#38BDF8] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span className="font-medium">{host}</span>
                    <span className="text-[#64748B] truncate max-w-[200px] hidden sm:inline">
                      {feed}
                    </span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                );
              })}
            </div>
          )}

          {newsKeywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11.5px] text-[#94A3B8] mr-1">
                {t(lang, 'NewsSourcesKeywords')}:
              </span>
              {newsKeywords.map((kw) => {
                const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
                  `"${kw}"`
                )}&hl=en-US&gl=US&ceid=US:en`;
                return (
                  <a
                    key={kw}
                    href={googleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={googleUrl}
                    className="bg-[#00D4AA]/10 hover:bg-[#00D4AA]/20 border border-[#00D4AA]/30 rounded-[6px] px-2 py-0.5 text-[11.5px] text-[#00D4AA] inline-flex items-center gap-1 transition-colors"
                  >
                    <span>{kw}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-[10px] px-3 py-2 text-[#FCA5A5] text-[13px]">
          {errorMessage}
        </div>
      )}

      {/* Empty State */}
      {filteredItems.length === 0 ? (
        <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-9 text-center animate-card-enter">
          <div className="text-[16px] font-semibold text-[#94A3B8]">
            {t(lang, 'NoNewsFound')}
          </div>
          <p className="text-[12.5px] text-[#64748B] mt-1.5">
            {t(lang, 'NewsHintCheckSettings')}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item, idx) => (
            <div
              key={`${item.link}-${idx}`}
              className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-4 flex items-center justify-between gap-4 animate-card-enter"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="bg-[#38BDF8]/10 text-[#38BDF8] rounded-[6px] px-2 py-0.5 text-[11.5px] font-semibold">
                    {item.source}
                  </span>
                  <span className="bg-[#00D4AA]/10 text-[#00D4AA] rounded-[6px] px-2 py-0.5 text-[11.5px]">
                    {item.matchedQuery}
                  </span>
                  {item.relevance === 'DirectPearl' ? (
                    <span className="bg-[#F59E0B]/15 text-[#F59E0B] rounded-[6px] px-2 py-0.5 text-[11px] font-semibold">
                      PEARL
                    </span>
                  ) : (
                    <span className="bg-[#1B263B] text-[#94A3B8] rounded-[6px] px-2 py-0.5 text-[11px]">
                      {lang === 'en' ? 'Market' : 'Рынок'}
                    </span>
                  )}
                  {sentimentBadge(item.sentiment)}
                  {typeof item.relevanceScore === 'number' && (
                    <span className="text-[11px] text-[#64748B]">
                      Score: {item.relevanceScore}
                    </span>
                  )}
                  <span className="text-[12px] text-[#64748B]">{item.formattedDate}</span>
                </div>

                <h3 className="text-[14.5px] font-semibold text-[#F1F5F9] leading-[20px]">
                  {item.title}
                </h3>
              </div>

              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] hover:border-[#384E75] rounded-[10px] px-3.5 py-2 text-[13px] font-medium shrink-0 inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>{t(lang, 'OpenLink').replace(' ↗', '')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
