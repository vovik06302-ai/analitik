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

        ["ConnectionStatusHeader"] = "Подключения",
        ["ConnectionChecking"] = "Проверка подключения...",
        ["BtnTestConnection"] = "Проверить связь",
        ["BtnRefreshConnectionsTooltip"] = "Проверить подключение к Ollama и Claude API",

        ["OllamaTooltipConnected"] = "Подключено к {0}. Доступно моделей: {1}.",
        ["OllamaTooltipNoModels"] = "Сервер Ollama запущен, но модели не найдены. Выполните в терминале: ollama pull qwen2.5vl:32b или ollama pull qwen2.5vl:7b",
        ["OllamaTooltipTimeout"] = "Превышено время ожидания ответа от {0}. Убедитесь, что Ollama не перегружен и адрес указан верно.",
        ["OllamaTooltipHttpError"] = "Сервер Ollama ({1}) вернул HTTP {0}. Проверьте адрес сервера в разделе «Настройки» (по умолчанию http://localhost:11434).",
        ["OllamaTooltipConnectionError"] = "Не удалось подключиться к {0} ({1}).\nКак исправить:\n1. Запустите Ollama на компьютере (команда: ollama serve).\n2. Проверьте адрес и порт (по умолчанию http://localhost:11434).\n3. Убедитесь, что брандмауэр/антивирус не блокирует порт 11434.",

        ["ClaudeConnected"] = "Claude API: подключен",
        ["ClaudeNotConfigured"] = "Claude API: ключ не задан",
        ["ClaudeOffline"] = "Claude API: нет связи",
        ["ClaudeAuthError"] = "Claude API: ошибка ключа ({0})",
        ["ClaudeRateLimit"] = "Claude API: лимит (429)",
        ["ClaudeHttpError"] = "Claude API: ошибка ({0})",

        ["ClaudeTooltipConnected"] = "Соединение с api.anthropic.com активно, ключ Claude API подтверждён.",
        ["ClaudeTooltipNoKey"] = "Ключ Claude API не указан.\nКак настроить:\n1. Перейдите в раздел «Настройки» -> «ИИ-провайдер и модель».\n2. Выберите провайдер Claude и введите ключ Anthropic API.\n3. Нажмите «Сохранить настройки» (ключ шифруется через DPAPI).",
        ["ClaudeTooltipAuthError"] = "Сервер Anthropic отклонил ключ (HTTP 401/403).\nКак исправить:\n1. Проверьте ключ API на опечатки и лишние пробелы.\n2. Убедитесь, что ключ активен в консоли Anthropic (console.anthropic.com) и привязан биллинг.",
        ["ClaudeTooltipRateLimit"] = "Превышен лимит запросов к Anthropic API (HTTP 429).\nПодождите немного или проверьте квоты в console.anthropic.com.",
        ["ClaudeTooltipTimeout"] = "Превышено время ожидания ответа от api.anthropic.com.\nПроверьте интернет-соединение, VPN или настройки прокси.",
        ["ClaudeTooltipHttpError"] = "Сервер Anthropic вернул код HTTP {0}.\nПроверьте доступность сервиса на status.anthropic.com и повторите попытку.",
        ["ClaudeTooltipNetworkError"] = "Не удалось подключиться к api.anthropic.com ({0}).\nКак исправить:\n1. Проверьте подключение к интернету.\n2. Проверьте, не блокирует ли доступ VPN, прокси или брандмауэр.",

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
        ["SettingsOllamaModelManual"] = "Выбранная модель Ollama (или введите вручную)",
        ["SettingsClaudeKey"] = "Ключ Claude API (шифруется через DPAPI)",
        ["SettingsClaudeModel"] = "Модель Claude",
        ["SettingsClaudeModelManual"] = "Или введите ID модели Claude вручную",
        ["SidebarModelSection"] = "Провайдер и модель",
        ["BtnRefreshModelsTooltip"] = "Обновить список моделей",
        ["NoOllamaModelsShort"] = "Нет установленных моделей в Ollama",
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

        ["ConnectionStatusHeader"] = "Connections",
        ["ConnectionChecking"] = "Checking connection...",
        ["BtnTestConnection"] = "Test connection",
        ["BtnRefreshConnectionsTooltip"] = "Check Ollama and Claude API connections",

        ["OllamaTooltipConnected"] = "Connected to {0}. Models available: {1}.",
        ["OllamaTooltipNoModels"] = "Ollama server is running, but no models are installed. Run in terminal: ollama pull qwen2.5vl:32b or ollama pull qwen2.5vl:7b",
        ["OllamaTooltipTimeout"] = "Timed out waiting for response from {0}. Ensure Ollama is responsive and the URL is correct.",
        ["OllamaTooltipHttpError"] = "Ollama server ({1}) returned HTTP {0}. Check the server URL in Settings (default http://localhost:11434).",
        ["OllamaTooltipConnectionError"] = "Failed to connect to {0} ({1}).\nTroubleshooting:\n1. Start Ollama on this PC (command: ollama serve).\n2. Verify host/port (default http://localhost:11434).\n3. Check that firewall/antivirus does not block port 11434.",

        ["ClaudeConnected"] = "Claude API: connected",
        ["ClaudeNotConfigured"] = "Claude API: no API key",
        ["ClaudeOffline"] = "Claude API: unreachable",
        ["ClaudeAuthError"] = "Claude API: key error ({0})",
        ["ClaudeRateLimit"] = "Claude API: rate limit (429)",
        ["ClaudeHttpError"] = "Claude API: error ({0})",

        ["ClaudeTooltipConnected"] = "Connected to api.anthropic.com; Claude API key is valid.",
        ["ClaudeTooltipNoKey"] = "Claude API key is not configured.\nSetup steps:\n1. Open Settings -> AI Provider & Model.\n2. Select Claude and enter your Anthropic API key.\n3. Click Save Settings (encrypted locally via DPAPI).",
        ["ClaudeTooltipAuthError"] = "Anthropic API rejected the key (HTTP 401/403).\nTroubleshooting:\n1. Check the API key for typos or extra spaces.\n2. Verify key status and billing in console.anthropic.com.",
        ["ClaudeTooltipRateLimit"] = "Anthropic API rate limit exceeded (HTTP 429).\nWait a moment or check usage quotas in console.anthropic.com.",
        ["ClaudeTooltipTimeout"] = "Timed out connecting to api.anthropic.com.\nCheck your internet connection, VPN, or proxy settings.",
        ["ClaudeTooltipHttpError"] = "Anthropic server returned HTTP {0}.\nCheck service status at status.anthropic.com and try again.",
        ["ClaudeTooltipNetworkError"] = "Could not connect to api.anthropic.com ({0}).\nTroubleshooting:\n1. Verify internet connectivity.\n2. Check whether VPN, proxy, or firewall blocks api.anthropic.com.",

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
        ["SettingsOllamaModelManual"] = "Selected Ollama model (or enter manually)",
        ["SettingsClaudeKey"] = "Claude API key (DPAPI encrypted)",
        ["SettingsClaudeModel"] = "Claude model",
        ["SettingsClaudeModelManual"] = "Or enter Claude model ID manually",
        ["SidebarModelSection"] = "Provider & Model",
        ["BtnRefreshModelsTooltip"] = "Refresh models",
        ["NoOllamaModelsShort"] = "No models installed in Ollama",
        ["SettingsNotifyDirection"] = "Notify on direction change",
        ["SettingsNotifyThreshold"] = "Confidence threshold for notification (%)",
        ["SettingsMinimizeToTray"] = "Minimize to tray on close",
        ["SettingsAutoStart"] = "Start with Windows",
        ["SettingsLanguage"] = "Interface language"
    };
}
