import React, { useMemo, useState } from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { ForecastHistoryEntry, HorizonAccuracy } from '../types';
import { Language, t } from '../i18n/translations';
import {
  calculateAccuracyMetrics,
  exportHistoryToCsv,
  formatLocalDateTime,
  formatPrice,
  formatResponseTime,
  getDirectionColor,
  getDirectionLabel,
} from '../utils/forecast';

interface HistoryViewProps {
  lang: Language;
  entries: ForecastHistoryEntry[];
  isVerifyingMarket: boolean;
  onRefreshHistory: () => void;
  onVerifyMarket: () => Promise<number>;
  onDeleteEntry: (id: number) => Promise<void>;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  lang,
  entries,
  isVerifyingMarket,
  onRefreshHistory,
  onVerifyMarket,
  onDeleteEntry,
}) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const metrics = useMemo(() => calculateAccuracyMetrics(entries), [entries]);
  const noData = t(lang, 'NoData');

  const formatHorizon = (h: HorizonAccuracy): { main: string; sub: string } => {
    if (h.hasSufficientData && h.accuracyPercent !== null) {
      return {
        main: `${h.accuracyPercent.toFixed(1)}%`,
        sub:
          lang === 'en'
            ? `correct ${h.correctCount} of ${h.evaluableCount}`
            : `верно ${h.correctCount} из ${h.evaluableCount}`,
      };
    }
    return {
      main: t(lang, 'InsufficientData'),
      sub:
        lang === 'en'
          ? `evaluated: ${h.evaluableCount} (min. 3)`
          : `оценено: ${h.evaluableCount} (мин. 3)`,
    };
  };

  const acc1h = formatHorizon(metrics.oneHour);
  const acc2h = formatHorizon(metrics.twoHours);
  const acc4h = formatHorizon(metrics.fourHours);

  const handleExportCsv = () => {
    if (entries.length === 0) {
      setStatusMessage(
        lang === 'en' ? 'No entries to export.' : 'Нет записей для экспорта.'
      );
      return;
    }
    exportHistoryToCsv(entries);
    setStatusMessage(
      lang === 'en' ? 'CSV export downloaded.' : 'Экспорт в CSV выполнен.'
    );
  };

  const handleVerifyClick = async () => {
    const updated = await onVerifyMarket();
    setStatusMessage(
      lang === 'en'
        ? `Verified actual market prices for ${updated} forecast(s).`
        : `Проверены фактические цены по рынку для ${updated} прогнозов.`
    );
  };

  const selectedEntry = entries.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-full space-y-3.5 pb-6">
      {/* Accuracy & Calibration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
        <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-4 animate-card-enter">
          <div className="text-[12.5px] text-[#94A3B8]">{t(lang, 'Accuracy1h')}</div>
          <div className="text-[22px] font-bold text-[#00D4AA] mt-1 mb-0.5">
            {acc1h.main}
          </div>
          <div className="text-[11.5px] text-[#64748B]">{acc1h.sub}</div>
        </div>

        <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-4 animate-card-enter">
          <div className="text-[12.5px] text-[#94A3B8]">{t(lang, 'Accuracy2h')}</div>
          <div className="text-[22px] font-bold text-[#38BDF8] mt-1 mb-0.5">
            {acc2h.main}
          </div>
          <div className="text-[11.5px] text-[#64748B]">{acc2h.sub}</div>
        </div>

        <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-4 animate-card-enter">
          <div className="text-[12.5px] text-[#94A3B8]">{t(lang, 'Accuracy4h')}</div>
          <div className="text-[22px] font-bold text-[#F59E0B] mt-1 mb-0.5">
            {acc4h.main}
          </div>
          <div className="text-[11.5px] text-[#64748B]">{acc4h.sub}</div>
        </div>

        <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-4 animate-card-enter">
          <div className="text-[12.5px] text-[#94A3B8]">{t(lang, 'CalibrationTitle')}</div>
          <div className="text-[22px] font-bold text-[#22C55E] mt-1 mb-0.5">
            {metrics.calibration.highConfWinRate !== null
              ? `${metrics.calibration.highConfWinRate.toFixed(1)}%`
              : t(lang, 'InsufficientData')}
          </div>
          <div className="text-[11.5px] text-[#64748B]">
            {lang === 'en'
              ? `${metrics.calibration.highConfCorrect}/${metrics.calibration.highConfTotal} wins • Avg target err: ${
                  metrics.calibration.avgTargetErrorPercent !== null
                    ? `${metrics.calibration.avgTargetErrorPercent}%`
                    : noData
                }`
              : `${metrics.calibration.highConfCorrect}/${metrics.calibration.highConfTotal} верных • Ср. ошибка цели: ${
                  metrics.calibration.avgTargetErrorPercent !== null
                    ? `${metrics.calibration.avgTargetErrorPercent}%`
                    : noData
                }`}
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 animate-card-enter">
        <span className="text-[12.5px] text-[#00D4AA]">{statusMessage}</span>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={isVerifyingMarket}
            onClick={() => void handleVerifyClick()}
            className="bg-[#1B263B] hover:bg-[#24334F] text-[#38BDF8] border border-[#25324D] hover:border-[#38BDF8] rounded-[10px] px-3.5 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{t(lang, 'VerifyAccuracyBtn')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onRefreshHistory();
              setStatusMessage(
                lang === 'en' ? 'History refreshed.' : 'История обновлена.'
              );
            }}
            className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] hover:border-[#384E75] rounded-[10px] px-3.5 py-2 text-[13px] font-medium cursor-pointer transition-colors"
          >
            {t(lang, 'BtnRefreshHistory')}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="bg-[#00D4AA] hover:bg-[#22E7BF] text-[#071216] rounded-[10px] px-4 py-2 text-[13.5px] font-semibold cursor-pointer transition-colors"
          >
            {t(lang, 'BtnExportCsv')}
          </button>
        </div>
      </div>

      {/* History DataGrid + Audit Drawer */}
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] overflow-hidden flex-1 min-h-[260px] flex flex-col animate-card-enter">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead className="bg-[#101624] text-[#94A3B8] text-[12px] font-semibold sticky top-0 border-b border-[#25324D]">
              <tr>
                <th className="px-3 py-2.5 whitespace-nowrap">
                  {lang === 'en' ? 'Time' : 'Время'}
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap">
                  {lang === 'en' ? 'Price' : 'Цена'}
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap">
                  {t(lang, 'LabelDirection')}
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap">
                  {t(lang, 'LabelConfidence')}
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap">
                  {t(lang, 'LabelTargetPrice')}
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap">
                  {lang === 'en' ? 'Fact 1h / 4h' : 'Факт 1ч / 4ч'}
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap">
                  {t(lang, 'LabelModel')}
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap">
                  {lang === 'en' ? 'Response' : 'Время ответа'}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[#64748B]">
                    {t(lang, 'NoData')}
                  </td>
                </tr>
              ) : (
                entries.map((entry, idx) => {
                  const isSelected = entry.id === selectedId;
                  return (
                    <tr
                      key={entry.id}
                      onClick={() =>
                        setSelectedId(isSelected ? null : entry.id)
                      }
                      className={`border-b border-[#222E46] cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#20314D]'
                          : idx % 2 === 0
                          ? 'bg-[#151D2E] hover:bg-[#1B263B]'
                          : 'bg-[#192338] hover:bg-[#1F2C45]'
                      }`}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#F1F5F9]">
                        {formatLocalDateTime(entry.createdAtUtc)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#F1F5F9]">
                        {formatPrice(entry.marketPriceAtForecast ?? entry.priceNow, noData)}
                      </td>
                      <td
                        className="px-3 py-2.5 whitespace-nowrap font-bold"
                        style={{ color: getDirectionColor(entry.direction) }}
                      >
                        {getDirectionLabel(entry.direction, lang)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#F1F5F9]">
                        {entry.confidence}%
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#F1F5F9]">
                        {formatPrice(entry.targetPrice, noData)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#38BDF8] text-[12px]">
                        {entry.actualPrice1h ? formatPrice(entry.actualPrice1h, '-') : '—'} /{' '}
                        {entry.actualPrice4h ? formatPrice(entry.actualPrice4h, '-') : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[#F1F5F9] truncate max-w-[190px]">
                        {entry.modelName}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#F1F5F9]">
                        {formatResponseTime(entry.responseTimeMs, noData)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {selectedEntry && (
          <div className="border-t border-[#25324D] bg-[#101624] p-4 text-[12.5px] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3 text-[#94A3B8]">
                <span className="font-semibold text-[#F1F5F9]">
                  #{selectedEntry.id} • {formatLocalDateTime(selectedEntry.createdAtUtc)}
                </span>
                <span>
                  {lang === 'en' ? 'Market' : 'Рынок'}:{' '}
                  <strong className="text-[#00D4AA]">
                    {formatPrice(selectedEntry.marketPriceAtForecast ?? selectedEntry.priceNow, noData)}
                  </strong>
                </span>
                <span>
                  1h:{' '}
                  <strong className="text-[#F1F5F9]">
                    {formatPrice(selectedEntry.actualPrice1h, noData)}
                  </strong>
                </span>
                <span>
                  2h:{' '}
                  <strong className="text-[#F1F5F9]">
                    {formatPrice(selectedEntry.actualPrice2h, noData)}
                  </strong>
                </span>
                <span>
                  4h:{' '}
                  <strong className="text-[#F1F5F9]">
                    {formatPrice(selectedEntry.actualPrice4h, noData)}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  void onDeleteEntry(selectedEntry.id);
                  setSelectedId(null);
                }}
                className="bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#FCA5A5] border border-[#EF4444]/40 rounded-[8px] px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t(lang, 'AuditDeleteBtn')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2 space-y-1.5 text-[#94A3B8]">
                <div>
                  <strong className="text-[#00D4AA]">{t(lang, 'LabelChartReasons')}:</strong>{' '}
                  {selectedEntry.chartReasons || noData}
                </div>
                <div>
                  <strong className="text-[#38BDF8]">{t(lang, 'LabelNewsImpact')}:</strong>{' '}
                  {selectedEntry.newsImpact || noData}
                </div>
                <div>
                  <strong className="text-[#F59E0B]">{t(lang, 'LabelRisks')}:</strong>{' '}
                  {selectedEntry.risks || noData}
                </div>
                {selectedEntry.newsSnapshot && selectedEntry.newsSnapshot.length > 0 && (
                  <div className="pt-1">
                    <div className="text-[#F1F5F9] font-semibold mb-1">
                      {lang === 'en' ? 'News snapshot:' : 'Снимок новостей на момент прогноза:'}
                    </div>
                    <ul className="space-y-0.5 text-[11.5px] text-[#94A3B8]">
                      {selectedEntry.newsSnapshot.slice(0, 5).map((n, i) => (
                        <li key={i} className="truncate">
                          • [{n.source}] {n.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {selectedEntry.screenshotDataUrl && (
                <div className="bg-[#0A0E17] border border-[#25324D] rounded-[10px] p-2">
                  <div className="text-[11px] text-[#94A3B8] mb-1">
                    {t(lang, 'AuditScreenshotTitle')}
                  </div>
                  <img
                    src={selectedEntry.screenshotDataUrl}
                    alt={`Forecast #${selectedEntry.id}`}
                    className="max-h-[150px] w-full object-contain rounded"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
