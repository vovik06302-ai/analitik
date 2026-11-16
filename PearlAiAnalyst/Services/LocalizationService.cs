using System.ComponentModel;

namespace PearlAiAnalyst.Services;

public sealed class LocalizationService : INotifyPropertyChanged
{
    public static LocalizationService Instance { get; } = new();

    private string _currentLanguage = "ru";

    public event PropertyChangedEventHandler? PropertyChanged;

    public string CurrentLanguage => _currentLanguage;

    public string this[string key] => Get(key);

    public void SetLanguage(string language)
    {
        var normalized = string.Equals(language, "en", StringComparison.OrdinalIgnoreCase)
            ? "en"
            : "ru";

        if (_currentLanguage == normalized)
            return;

        _currentLanguage = normalized;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs("Item[]"));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(CurrentLanguage)));
    }

    public string Get(string key)
    {
        var dict = _currentLanguage == "en" ? EnStrings : RuStrings;
        if (dict.TryGetValue(key, out var value))
            return value;

        return RuStrings.TryGetValue(key, out var fallback) ? fallback : key;
    }

    private static readonly Dictionary<string, string> RuStrings = new()
    {
        ["AppTitle"] = "Pearl AI Analyst",
        ["SubtitlePair"] = "PEARL / USDT • SafeTrade",
        ["NavForecast"] = "Прогноз",
        ["NavNews"] = "Новости",
        ["NavHistory"] = "История",
        ["NavSettings"] = "Настройки",

        ["BtnAnalyzeNow"] = "Анализировать сейчас",
        ["BtnAnalyzing"] = "Анализ выполняется...",
        ["BtnSelectRegion"] = "Выбрать область",
        ["BtnRefreshNews"] = "Обновить новости",
        ["BtnRefreshHistory"] = "Обновить",
        ["BtnExportCsv"] = "Экспорт в CSV",
        ["BtnCheckUpdates"] = "Проверить обновления",
        ["BtnSaveSettings"] = "Сохранить настройки",
        ["BtnRefreshModels"] = "Обновить модели",
        ["BtnUpdateNow"] = "Обновить",
        ["BtnUpdateLater"] = "Позже",

        ["Disclaimer"] = "Приблизительная оценка, не финансовый совет",
        ["NoData"] = "нет данных",
        ["NoNewsFound"] = "новостей не найдено",
        ["InsufficientData"] = "недостаточно данных",

        ["DirectionUp"] = "ВВЕРХ",
        ["DirectionDown"] = "ВНИЗ",
        ["DirectionSideways"] = "БОКОВИК",
        ["DirectionUnknown"] = "нет данных",

        ["LabelDirection"] = "Направление",
        ["LabelConfidence"] = "Уверенность",
        ["LabelCurrentPrice"] = "Текущая цена",
        ["LabelTargetPrice"] = "Цель",
        ["LabelStopPrice"] = "Стоп",
        ["LabelSupport"] = "Поддержка",
        ["LabelResistance"] = "Сопротивление",
        ["LabelChartReasons"] = "Причины по графику",
        ["LabelNewsImpact"] = "Влияние новостей",
        ["LabelNewsReasons"] = "Новостные факторы",
        ["LabelRisks"] = "Риски",
        ["LabelLastScreenshot"] = "Последний скриншот графика",
        ["LabelResponseTime"] = "Время ответа ИИ",
        ["LabelModel"] = "Модель",
        ["LabelAutoMode"] = "Авто-режим",
        ["LabelNextRun"] = "Следующий запуск",
        ["LabelRegion"] = "Область экрана",
        ["LabelVersion"] = "Версия программы",

        ["Accuracy1h"] = "Точность (1 час)",
        ["Accuracy2h"] = "Точность (2 часа)",
        ["Accuracy4h"] = "Точность (4 часа)",

        ["OllamaRunning"] = "Ollama запущен",
        ["OllamaOffline"] = "Ollama не запущен",
        ["OllamaOfflineHint"] = "Запустите Ollama на этом ПК (команда: ollama serve) и убедитесь, что установлена модель с поддержкой изображений: ollama pull qwen2.5vl:32b (или qwen2.5vl:7b).",

        ["UpdateAvailableTitle"] = "Доступно обновление",
        ["UpdateUpToDate"] = "У вас последняя версия",
        ["UpdateDownloading"] = "Загрузка обновления...",

        ["TrayOpen"] = "Открыть Pearl AI Analyst",
        ["TrayAnalyze"] = "Запустить анализ сейчас",
        ["TrayExit"] = "Выход",

        ["EmptyForecastTitle"] = "Прогноз ещё не выполнен",
        ["EmptyForecastSubtitle"] = "Выберите область с графиком PEARL/USDT и нажмите «Анализировать сейчас».",
        ["RegionOverlayHint"] = "Выделите рамкой область с графиком PEARL/USDT • Esc или ПКМ — отмена",

        ["SettingsSectionCapture"] = "Захват экрана и расписание",
        ["SettingsSectionAi"] = "ИИ-провайдер и модель",
        ["SettingsSectionNews"] = "Источники новостей (RSS и ключевые слова)",
        ["SettingsSectionNotifications"] = "Уведомления, система и обновления",

        ["SettingsIntervalLabel"] = "Интервал авто-анализа (минут)",
        ["SettingsAutoEnabled"] = "Включить автоматический режим",
        ["SettingsProviderLabel"] = "Провайдер ИИ",
        ["SettingsOllamaUrl"] = "Адрес сервера Ollama",
        ["SettingsOllamaModel"] = "Модель Ollama",
        ["SettingsClaudeKey"] = "Ключ Claude API (шифруется через DPAPI)",
        ["SettingsClaudeModel"] = "Модель Claude",
        ["SettingsNotifyDirection"] = "Уведомлять при смене направления",
        ["SettingsNotifyThreshold"] = "Порог уверенности для уведомления (%)",
        ["SettingsMinimizeToTray"] = "Сворачивать в трей при закрытии окна",
        ["SettingsAutoStart"] = "Запускать вместе с Windows",
        ["SettingsLanguage"] = "Язык интерфейса"
    };

    private static readonly Dictionary<string, string> EnStrings = new()
    {
        ["AppTitle"] = "Pearl AI Analyst",
        ["SubtitlePair"] = "PEARL / USDT • SafeTrade",
        ["NavForecast"] = "Forecast",
        ["NavNews"] = "News",
        ["NavHistory"] = "History",
        ["NavSettings"] = "Settings",

        ["BtnAnalyzeNow"] = "Analyze Now",
        ["BtnAnalyzing"] = "Analyzing...",
        ["BtnSelectRegion"] = "Select Region",
        ["BtnRefreshNews"] = "Refresh News",
        ["BtnRefreshHistory"] = "Refresh",
        ["BtnExportCsv"] = "Export CSV",
        ["BtnCheckUpdates"] = "Check for Updates",
        ["BtnSaveSettings"] = "Save Settings",
        ["BtnRefreshModels"] = "Refresh Models",
        ["BtnUpdateNow"] = "Update",
        ["BtnUpdateLater"] = "Later",

        ["Disclaimer"] = "Approximate estimate, not financial advice",
        ["NoData"] = "no data",
        ["NoNewsFound"] = "no news found",
        ["InsufficientData"] = "insufficient data",

        ["DirectionUp"] = "UP",
        ["DirectionDown"] = "DOWN",
        ["DirectionSideways"] = "SIDEWAYS",
        ["DirectionUnknown"] = "no data",

        ["LabelDirection"] = "Direction",
        ["LabelConfidence"] = "Confidence",
        ["LabelCurrentPrice"] = "Current Price",
        ["LabelTargetPrice"] = "Target",
        ["LabelStopPrice"] = "Stop",
        ["LabelSupport"] = "Support",
        ["LabelResistance"] = "Resistance",
        ["LabelChartReasons"] = "Chart Reasons",
        ["LabelNewsImpact"] = "News Impact",
        ["LabelNewsReasons"] = "News Factors",
        ["LabelRisks"] = "Risks",
        ["LabelLastScreenshot"] = "Last Chart Screenshot",
        ["LabelResponseTime"] = "AI Response Time",
        ["LabelModel"] = "Model",
        ["LabelAutoMode"] = "Auto Mode",
        ["LabelNextRun"] = "Next Run",
        ["LabelRegion"] = "Capture Region",
        ["LabelVersion"] = "App Version",

        ["Accuracy1h"] = "Accuracy (1h)",
        ["Accuracy2h"] = "Accuracy (2h)",
        ["Accuracy4h"] = "Accuracy (4h)",

        ["OllamaRunning"] = "Ollama running",
        ["OllamaOffline"] = "Ollama offline",
        ["OllamaOfflineHint"] = "Start Ollama on this PC (command: ollama serve) and ensure a vision model is pulled: ollama pull qwen2.5vl:32b (or qwen2.5vl:7b).",

        ["UpdateAvailableTitle"] = "Update Available",
        ["UpdateUpToDate"] = "You have the latest version",
        ["UpdateDownloading"] = "Downloading update...",

        ["TrayOpen"] = "Open Pearl AI Analyst",
        ["TrayAnalyze"] = "Run Analysis Now",
        ["TrayExit"] = "Exit",

        ["EmptyForecastTitle"] = "No forecast yet",
        ["EmptyForecastSubtitle"] = "Select the PEARL/USDT chart region and click «Analyze Now».",
        ["RegionOverlayHint"] = "Drag to select the PEARL/USDT chart area • Esc or Right-Click to cancel",

        ["SettingsSectionCapture"] = "Screen Capture & Schedule",
        ["SettingsSectionAi"] = "AI Provider & Model",
        ["SettingsSectionNews"] = "News Sources (RSS & Keywords)",
        ["SettingsSectionNotifications"] = "Notifications, System & Updates",

        ["SettingsIntervalLabel"] = "Auto-analysis interval (minutes)",
        ["SettingsAutoEnabled"] = "Enable automatic mode",
        ["SettingsProviderLabel"] = "AI Provider",
        ["SettingsOllamaUrl"] = "Ollama server URL",
        ["SettingsOllamaModel"] = "Ollama model",
        ["SettingsClaudeKey"] = "Claude API key (DPAPI encrypted)",
        ["SettingsClaudeModel"] = "Claude model",
        ["SettingsNotifyDirection"] = "Notify on direction change",
        ["SettingsNotifyThreshold"] = "Confidence threshold for notification (%)",
        ["SettingsMinimizeToTray"] = "Minimize to tray on close",
        ["SettingsAutoStart"] = "Start with Windows",
        ["SettingsLanguage"] = "Interface language"
    };
}
