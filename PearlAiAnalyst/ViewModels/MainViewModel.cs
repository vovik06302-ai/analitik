using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PearlAiAnalyst.Models;
using PearlAiAnalyst.Services;

namespace PearlAiAnalyst.ViewModels;

public sealed partial class MainViewModel : ObservableObject, IDisposable
{
    private readonly LoggerService _logger;
    private readonly SettingsService _settingsService;
    private readonly ScreenCaptureService _screenCaptureService;
    private readonly NewsService _newsService;
    private readonly OllamaClient _ollamaClient;
    private readonly ClaudeClient _claudeClient;
    private readonly HistoryRepository _historyRepository;
    private readonly UpdateService _updateService;
    private readonly TrayNotificationService _trayService;

    private readonly DispatcherTimer _autoCountdownTimer;
    private readonly DispatcherTimer _ollamaPollTimer;
    private DateTimeOffset? _nextAutoRunUtc;
    private ForecastDirection _lastNotifiedDirection = ForecastDirection.Unknown;
    private CancellationTokenSource? _analysisCts;

    public ForecastViewModel Forecast { get; }
    public NewsViewModel News { get; }
    public HistoryViewModel History { get; }
    public SettingsViewModel Settings { get; }

    [ObservableProperty]
    private int _selectedTabIndex;

    [ObservableProperty]
    private bool _isAnalyzing;

    [ObservableProperty]
    private string _analysisStepText = string.Empty;

    [ObservableProperty]
    private string _errorBannerText = string.Empty;

    [ObservableProperty]
    private string _infoBannerText = string.Empty;

    [ObservableProperty]
    private bool _isOllamaRunning;

    [ObservableProperty]
    private string _ollamaStatusText = "Проверка Ollama...";

    [ObservableProperty]
    private string _ollamaOfflineHint = string.Empty;

    [ObservableProperty]
    private bool _isAutoModeActive;

    [ObservableProperty]
    private string _autoCountdownText = string.Empty;

    [ObservableProperty]
    private string _regionBadgeText = "Область: не задана";

    public string AppVersionText => $"v{AppConstants.CurrentVersion}";

    public event Func<Task<CaptureRegion?>>? SelectRegionOverlayRequested;
    public event Action<UpdateCheckResult>? UpdateDialogRequested;
    public event Action? TabChanged;

    public MainViewModel(
        LoggerService logger,
        SettingsService settingsService,
        ScreenCaptureService screenCaptureService,
        NewsService newsService,
        OllamaClient ollamaClient,
        ClaudeClient claudeClient,
        HistoryRepository historyRepository,
        UpdateService updateService,
        TrayNotificationService trayService)
    {
        _logger = logger;
        _settingsService = settingsService;
        _screenCaptureService = screenCaptureService;
        _newsService = newsService;
        _ollamaClient = ollamaClient;
        _claudeClient = claudeClient;
        _historyRepository = historyRepository;
        _updateService = updateService;
        _trayService = trayService;

        Forecast = new ForecastViewModel();
        News = new NewsViewModel(newsService, settingsService, logger);
        History = new HistoryViewModel(historyRepository, logger);
        Settings = new SettingsViewModel(
            settingsService,
            ollamaClient,
            SelectRegionAsync,
            CheckUpdatesAsync,
            ApplySettings);

        var initialSettings = _settingsService.Load();
        LocalizationService.Instance.SetLanguage(initialSettings.Language);
        _trayService.RefreshMenuText();

        var latestShot = _screenCaptureService.GetLatestScreenshotPath();
        Forecast.SetScreenshotPreview(latestShot);

        ApplySettings(initialSettings);

        _autoCountdownTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _autoCountdownTimer.Tick += AutoCountdownTimer_Tick;
        _autoCountdownTimer.Start();

        _ollamaPollTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(20) };
        _ollamaPollTimer.Tick += async (_, _) => await RefreshOllamaStatusAsync();
        _ollamaPollTimer.Start();
    }

    partial void OnSelectedTabIndexChanged(int value)
    {
        TabChanged?.Invoke();
    }

    public async Task InitializeAsync()
    {
        await RefreshOllamaStatusAsync();
        await Settings.RefreshOllamaModelsAsync();
        await History.LoadHistoryAsync();
        await News.RefreshNewsAsync();
        await CheckUpdatesAsync(showUpToDateMessage: false);
    }

    private void ApplySettings(AppSettings settings)
    {
        _trayService.RefreshMenuText();
        RegionBadgeText = $"Область: {settings.CaptureRegion}";
        IsAutoModeActive = settings.AutoModeEnabled;

        if (settings.AutoModeEnabled)
        {
            _nextAutoRunUtc = DateTimeOffset.UtcNow.AddMinutes(settings.AutoIntervalMinutes);
            UpdateCountdownDisplay();
        }
        else
        {
            _nextAutoRunUtc = null;
            AutoCountdownText = string.Empty;
        }
    }

    private async void AutoCountdownTimer_Tick(object? sender, EventArgs e)
    {
        if (!IsAutoModeActive || !_nextAutoRunUtc.HasValue)
            return;

        if (IsAnalyzing)
            return;

        var remaining = _nextAutoRunUtc.Value - DateTimeOffset.UtcNow;
        if (remaining <= TimeSpan.Zero)
        {
            var settings = _settingsService.Load();
            _nextAutoRunUtc = DateTimeOffset.UtcNow.AddMinutes(settings.AutoIntervalMinutes);
            UpdateCountdownDisplay();
            await RunAnalysisAsync();
        }
        else
        {
            UpdateCountdownDisplay();
        }
    }

    private void UpdateCountdownDisplay()
    {
        if (!_nextAutoRunUtc.HasValue)
        {
            AutoCountdownText = string.Empty;
            return;
        }

        var rem = _nextAutoRunUtc.Value - DateTimeOffset.UtcNow;
        if (rem < TimeSpan.Zero) rem = TimeSpan.Zero;
        AutoCountdownText = $"{(int)rem.TotalMinutes:D2}:{rem.Seconds:D2}";
    }

    [RelayCommand]
    public async Task RefreshOllamaStatusAsync()
    {
        var settings = _settingsService.Load();
        var status = await _ollamaClient.CheckStatusAsync(settings.OllamaUrl);
        IsOllamaRunning = status.IsRunning;
        OllamaStatusText = status.StatusMessage;
        OllamaOfflineHint = status.IsRunning ? string.Empty : status.HintMessage;
    }

    [RelayCommand]
    public async Task SelectRegionAsync()
    {
        ErrorBannerText = string.Empty;
        if (SelectRegionOverlayRequested is null)
            return;

        var region = await SelectRegionOverlayRequested.Invoke();
        if (region is not null && region.IsValid)
        {
            Settings.UpdateCapturedRegion(region);
            RegionBadgeText = $"Область: {region}";
            InfoBannerText = $"Область скриншота сохранена: {region}";

            try
            {
                var (shotPath, _) = await _screenCaptureService.CaptureRegionAsync(region);
                Forecast.SetScreenshotPreview(shotPath);
            }
            catch (Exception ex)
            {
                _logger.Warning($"Предварительный снимок после выделения не удался: {ex.Message}");
            }
        }
    }

    [RelayCommand]
    public async Task RunAnalysisAsync()
    {
        if (IsAnalyzing)
            return;

        var settings = _settingsService.Load();
        if (!settings.CaptureRegion.IsValid)
        {
            ErrorBannerText = "Сначала выберите область экрана с графиком PEARL/USDT (кнопка «Выбрать область»).";
            return;
        }

        IsAnalyzing = true;
        ErrorBannerText = string.Empty;
        InfoBannerText = string.Empty;
        _analysisCts = new CancellationTokenSource();

        try
        {
            var ct = _analysisCts.Token;

            AnalysisStepText = "Съёмка выбранной области экрана...";
            var (screenshotPath, base64Png) = await _screenCaptureService.CaptureRegionAsync(settings.CaptureRegion, ct);
            Forecast.SetScreenshotPreview(screenshotPath);

            AnalysisStepText = "Сбор новостей из RSS и поисковых запросов...";
            var news = await _newsService.FetchNewsAsync(settings.RssFeeds, settings.NewsKeywords, ct);
            News.UpdateFromItems(news);

            ForecastResult result;
            if (settings.Provider == AiProviderType.Claude)
            {
                AnalysisStepText = $"Запрос к Claude API ({settings.ClaudeModel})...";
                var apiKey = _settingsService.LoadClaudeApiKey();
                result = await _claudeClient.AnalyzeAsync(apiKey, settings.ClaudeModel, base64Png, screenshotPath, news, ct);
            }
            else
            {
                AnalysisStepText = $"Анализ изображения в Ollama ({settings.OllamaModel})...";
                await RefreshOllamaStatusAsync();
                if (!IsOllamaRunning)
                {
                    throw new InvalidOperationException(
                        "Ollama не запущен. Запустите Ollama на компьютере и повторите попытку.");
                }

                result = await _ollamaClient.AnalyzeAsync(settings.OllamaUrl, settings.OllamaModel, base64Png, screenshotPath, news, ct);
            }

            Forecast.ApplyForecast(result);
            await _historyRepository.SaveForecastAsync(result, ct);
            await History.LoadHistoryAsync();

            var directionChanged = _lastNotifiedDirection != ForecastDirection.Unknown &&
                                   result.Direction != _lastNotifiedDirection;
            var aboveThreshold = result.Confidence >= settings.NotifyConfidenceThreshold;

            if ((settings.NotifyOnDirectionChange && directionChanged) || aboveThreshold)
            {
                _trayService.ShowForecastNotification(result, directionChanged);
            }

            _lastNotifiedDirection = result.Direction;
            InfoBannerText = $"Анализ завершён за {result.ResponseTimeMs / 1000.0:F1} с ({result.ModelName}).";
        }
        catch (OperationCanceledException)
        {
            InfoBannerText = "Анализ отменён.";
        }
        catch (Exception ex)
        {
            _logger.Error("Ошибка при выполнении анализа.", ex);
            ErrorBannerText = ex.Message;
        }
        finally
        {
            IsAnalyzing = false;
            AnalysisStepText = string.Empty;
            _analysisCts?.Dispose();
            _analysisCts = null;

            if (IsAutoModeActive)
            {
                var refreshed = _settingsService.Load();
                _nextAutoRunUtc = DateTimeOffset.UtcNow.AddMinutes(refreshed.AutoIntervalMinutes);
                UpdateCountdownDisplay();
            }
        }
    }

    public async Task CheckUpdatesAsync(bool showUpToDateMessage)
    {
        var result = await _updateService.CheckForUpdatesAsync();
        switch (result.Status)
        {
            case UpdateCheckStatus.UpdateAvailable:
                UpdateDialogRequested?.Invoke(result);
                break;
            case UpdateCheckStatus.UpToDate:
                if (showUpToDateMessage)
                {
                    InfoBannerText = result.Message;
                    Settings.StatusMessage = result.Message;
                }
                break;
            case UpdateCheckStatus.NotInstalled:
                if (showUpToDateMessage)
                {
                    InfoBannerText = result.Message;
                    Settings.StatusMessage = result.Message;
                }
                break;
            case UpdateCheckStatus.Error:
                if (showUpToDateMessage)
                {
                    ErrorBannerText = result.Message;
                    Settings.StatusMessage = result.Message;
                }
                break;
        }
    }

    [RelayCommand]
    private void DismissError() => ErrorBannerText = string.Empty;

    [RelayCommand]
    private void DismissInfo() => InfoBannerText = string.Empty;

    public void Dispose()
    {
        _autoCountdownTimer.Stop();
        _ollamaPollTimer.Stop();
        _analysisCts?.Cancel();
        _analysisCts?.Dispose();
    }
}
