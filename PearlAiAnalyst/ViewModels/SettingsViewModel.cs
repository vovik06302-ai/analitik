using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PearlAiAnalyst.Models;
using PearlAiAnalyst.Services;

namespace PearlAiAnalyst.ViewModels;

public sealed partial class SettingsViewModel : ObservableObject
{
    private readonly SettingsService _settingsService;
    private readonly OllamaClient _ollamaClient;
    private readonly Func<Task> _onSelectRegionRequested;
    private readonly Func<bool, Task> _onCheckUpdatesRequested;
    private readonly Action<AppSettings> _onSettingsApplied;

    [ObservableProperty]
    private string _regionDisplayText = "не задана";

    [ObservableProperty]
    private int _autoIntervalMinutes = 15;

    [ObservableProperty]
    private bool _autoModeEnabled;

    [ObservableProperty]
    private AiProviderType _provider = AiProviderType.Ollama;

    [ObservableProperty]
    private string _ollamaUrl = AppConstants.DefaultOllamaUrl;

    [ObservableProperty]
    private string _ollamaModel = AppConstants.DefaultOllamaModel;

    [ObservableProperty]
    private string _claudeApiKey = string.Empty;

    [ObservableProperty]
    private string _claudeModel = AppConstants.DefaultClaudeModel;

    [ObservableProperty]
    private bool _notifyOnDirectionChange = true;

    [ObservableProperty]
    private int _notifyConfidenceThreshold = 70;

    [ObservableProperty]
    private bool _minimizeToTrayOnClose = true;

    [ObservableProperty]
    private bool _autoStartWithWindows;

    [ObservableProperty]
    private string _selectedLanguage = "ru";

    [ObservableProperty]
    private string _newRssUrl = string.Empty;

    [ObservableProperty]
    private string _newKeyword = string.Empty;

    [ObservableProperty]
    private string _statusMessage = string.Empty;

    [ObservableProperty]
    private bool _isCheckingOllama;

    [ObservableProperty]
    private string _ollamaModelsHint = string.Empty;

    public ObservableCollection<string> RssFeeds { get; } = [];
    public ObservableCollection<string> NewsKeywords { get; } = [];
    public ObservableCollection<string> AvailableOllamaModels { get; } = [];

    public IReadOnlyList<AiProviderType> Providers { get; } = [AiProviderType.Ollama, AiProviderType.Claude];
    public IReadOnlyList<string> AvailableLanguages { get; } = ["ru", "en"];

    public string AppVersionText => $"v{AppConstants.CurrentVersion}";

    private CaptureRegion _currentRegion = new();

    public SettingsViewModel(
        SettingsService settingsService,
        OllamaClient ollamaClient,
        Func<Task> onSelectRegionRequested,
        Func<bool, Task> onCheckUpdatesRequested,
        Action<AppSettings> onSettingsApplied)
    {
        _settingsService = settingsService;
        _ollamaClient = ollamaClient;
        _onSelectRegionRequested = onSelectRegionRequested;
        _onCheckUpdatesRequested = onCheckUpdatesRequested;
        _onSettingsApplied = onSettingsApplied;

        LoadFromService();
    }

    public void LoadFromService()
    {
        var s = _settingsService.Load();
        _currentRegion = s.CaptureRegion;
        RegionDisplayText = s.CaptureRegion.ToString();
        AutoIntervalMinutes = s.AutoIntervalMinutes;
        AutoModeEnabled = s.AutoModeEnabled;
        Provider = s.Provider;
        OllamaUrl = s.OllamaUrl;
        OllamaModel = s.OllamaModel;
        ClaudeModel = s.ClaudeModel;
        ClaudeApiKey = _settingsService.LoadClaudeApiKey();
        NotifyOnDirectionChange = s.NotifyOnDirectionChange;
        NotifyConfidenceThreshold = s.NotifyConfidenceThreshold;
        MinimizeToTrayOnClose = s.MinimizeToTrayOnClose;
        AutoStartWithWindows = s.AutoStartWithWindows;
        SelectedLanguage = s.Language;

        RssFeeds.Clear();
        foreach (var feed in s.RssFeeds) RssFeeds.Add(feed);

        NewsKeywords.Clear();
        foreach (var kw in s.NewsKeywords) NewsKeywords.Add(kw);
    }

    public void UpdateCapturedRegion(CaptureRegion region)
    {
        _currentRegion = region;
        RegionDisplayText = region.ToString();
        SaveSettings();
    }

    [RelayCommand]
    public async Task RefreshOllamaModelsAsync()
    {
        if (IsCheckingOllama)
            return;

        IsCheckingOllama = true;
        OllamaModelsHint = string.Empty;
        try
        {
            var status = await _ollamaClient.CheckStatusAsync(OllamaUrl);
            AvailableOllamaModels.Clear();
            foreach (var model in status.InstalledModels)
            {
                AvailableOllamaModels.Add(model);
            }

            if (AvailableOllamaModels.Count > 0)
            {
                if (!AvailableOllamaModels.Contains(OllamaModel))
                {
                    if (AvailableOllamaModels.Contains(AppConstants.DefaultOllamaModel))
                        OllamaModel = AppConstants.DefaultOllamaModel;
                    else if (AvailableOllamaModels.Contains(AppConstants.FallbackOllamaModel))
                        OllamaModel = AppConstants.FallbackOllamaModel;
                    else
                        OllamaModel = AvailableOllamaModels[0];
                }
            }
            else
            {
                OllamaModelsHint = status.IsRunning
                    ? status.HintMessage
                    : status.StatusMessage;
            }
        }
        finally
        {
            IsCheckingOllama = false;
        }
    }

    [RelayCommand]
    private void AddRssFeed()
    {
        var url = NewRssUrl.Trim();
        if (string.IsNullOrWhiteSpace(url))
            return;

        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            StatusMessage = "Введите корректный http/https адрес RSS-ленты.";
            return;
        }

        if (!RssFeeds.Contains(url, StringComparer.OrdinalIgnoreCase))
            RssFeeds.Add(url);

        NewRssUrl = string.Empty;
        StatusMessage = string.Empty;
    }

    [RelayCommand]
    private void RemoveRssFeed(string? url)
    {
        if (url is not null)
            RssFeeds.Remove(url);
    }

    [RelayCommand]
    private void AddKeyword()
    {
        var kw = NewKeyword.Trim();
        if (string.IsNullOrWhiteSpace(kw))
            return;

        if (!NewsKeywords.Contains(kw, StringComparer.OrdinalIgnoreCase))
            NewsKeywords.Add(kw);

        NewKeyword = string.Empty;
    }

    [RelayCommand]
    private void RemoveKeyword(string? kw)
    {
        if (kw is not null)
            NewsKeywords.Remove(kw);
    }

    [RelayCommand]
    private Task SelectRegionAsync() => _onSelectRegionRequested();

    [RelayCommand]
    private Task CheckUpdatesAsync() => _onCheckUpdatesRequested(true);

    [RelayCommand]
    public void SaveSettings()
    {
        try
        {
            var interval = Math.Clamp(AutoIntervalMinutes, 1, 1440);
            AutoIntervalMinutes = interval;

            var threshold = Math.Clamp(NotifyConfidenceThreshold, 0, 100);
            NotifyConfidenceThreshold = threshold;

            var settings = new AppSettings
            {
                CaptureRegion = _currentRegion,
                AutoIntervalMinutes = interval,
                AutoModeEnabled = AutoModeEnabled,
                Provider = Provider,
                OllamaUrl = string.IsNullOrWhiteSpace(OllamaUrl) ? AppConstants.DefaultOllamaUrl : OllamaUrl.Trim(),
                OllamaModel = string.IsNullOrWhiteSpace(OllamaModel) ? AppConstants.DefaultOllamaModel : OllamaModel.Trim(),
                ClaudeModel = string.IsNullOrWhiteSpace(ClaudeModel) ? AppConstants.DefaultClaudeModel : ClaudeModel.Trim(),
                RssFeeds = [.. RssFeeds],
                NewsKeywords = NewsKeywords.Count > 0 ? [.. NewsKeywords] : [.. AppConstants.DefaultNewsKeywords],
                NotifyOnDirectionChange = NotifyOnDirectionChange,
                NotifyConfidenceThreshold = threshold,
                MinimizeToTrayOnClose = MinimizeToTrayOnClose,
                AutoStartWithWindows = AutoStartWithWindows,
                Language = SelectedLanguage
            };

            _settingsService.Save(settings);
            _settingsService.SaveClaudeApiKey(ClaudeApiKey);
            LocalizationService.Instance.SetLanguage(settings.Language);
            _onSettingsApplied(settings);

            StatusMessage = "Настройки сохранены.";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Ошибка сохранения: {ex.Message}";
        }
    }
}
