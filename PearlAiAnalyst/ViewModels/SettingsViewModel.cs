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
    private readonly ClaudeClient _claudeClient;
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
    private string? _selectedOllamaListItem;

    [ObservableProperty]
    private string _claudeApiKey = string.Empty;

    [ObservableProperty]
    private string _claudeModel = AppConstants.DefaultClaudeModel;

    [ObservableProperty]
    private string? _selectedClaudeListItem;

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
    [NotifyCanExecuteChangedFor(nameof(RefreshOllamaModelsCommand))]
    private bool _isCheckingOllama;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(TestClaudeConnectionCommand))]
    private bool _isCheckingClaude;

    [ObservableProperty]
    private string _ollamaModelsHint = string.Empty;

    [ObservableProperty]
    private ServiceConnectionState _ollamaConnectionState = ServiceConnectionState.Checking;

    [ObservableProperty]
    private string _ollamaStatusText = LocalizationService.Instance["ConnectionChecking"];

    [ObservableProperty]
    private string _ollamaTroubleshootingTooltip = LocalizationService.Instance["ConnectionChecking"];

    [ObservableProperty]
    private ServiceConnectionState _claudeConnectionState = ServiceConnectionState.Checking;

    [ObservableProperty]
    private string _claudeStatusText = LocalizationService.Instance["ConnectionChecking"];

    [ObservableProperty]
    private string _claudeTroubleshootingTooltip = LocalizationService.Instance["ConnectionChecking"];

    public ObservableCollection<string> RssFeeds { get; } = [];
    public ObservableCollection<string> NewsKeywords { get; } = [];
    public ObservableCollection<string> AvailableModels { get; } = [];

    public IReadOnlyList<AiProviderType> Providers { get; } = [AiProviderType.Ollama, AiProviderType.Claude];
    public IReadOnlyList<string> AvailableClaudeModels { get; } = AppConstants.DefaultClaudeModels;
    public IReadOnlyList<string> AvailableLanguages { get; } = ["ru", "en"];

    public string AppVersionText => $"v{AppConstants.CurrentVersion}";

    private CaptureRegion _currentRegion = new();
    private bool _isSyncingModels;

    public event Action? ModelsRefreshed;

    public SettingsViewModel(
        SettingsService settingsService,
        OllamaClient ollamaClient,
        ClaudeClient claudeClient,
        Func<Task> onSelectRegionRequested,
        Func<bool, Task> onCheckUpdatesRequested,
        Action<AppSettings> onSettingsApplied)
    {
        _settingsService = settingsService;
        _ollamaClient = ollamaClient;
        _claudeClient = claudeClient;
        _onSelectRegionRequested = onSelectRegionRequested;
        _onCheckUpdatesRequested = onCheckUpdatesRequested;
        _onSettingsApplied = onSettingsApplied;

        LoadFromService();
    }

    partial void OnOllamaModelChanged(string value)
    {
        if (_isSyncingModels)
            return;

        _isSyncingModels = true;
        SelectedOllamaListItem = AvailableModels.Contains(value) ? value : null;
        _isSyncingModels = false;
    }

    partial void OnSelectedOllamaListItemChanged(string? value)
    {
        if (_isSyncingModels || string.IsNullOrWhiteSpace(value))
            return;

        _isSyncingModels = true;
        OllamaModel = value;
        _isSyncingModels = false;

        PersistOllamaModelToSettings(value);
        ModelsRefreshed?.Invoke();
    }

    partial void OnClaudeModelChanged(string value)
    {
        if (_isSyncingModels)
            return;

        _isSyncingModels = true;
        SelectedClaudeListItem = AvailableClaudeModels.Contains(value) ? value : null;
        _isSyncingModels = false;
    }

    partial void OnSelectedClaudeListItemChanged(string? value)
    {
        if (_isSyncingModels || string.IsNullOrWhiteSpace(value))
            return;

        _isSyncingModels = true;
        ClaudeModel = value;
        _isSyncingModels = false;
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

        _isSyncingModels = true;
        OllamaModel = s.OllamaModel;
        SelectedOllamaListItem = AvailableModels.Contains(s.OllamaModel) ? s.OllamaModel : null;
        ClaudeModel = s.ClaudeModel;
        SelectedClaudeListItem = AvailableClaudeModels.Contains(s.ClaudeModel) ? s.ClaudeModel : null;
        _isSyncingModels = false;

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

    private bool CanRefreshOllamaModels() => !IsCheckingOllama;

    [RelayCommand(CanExecute = nameof(CanRefreshOllamaModels))]
    public Task RefreshOllamaModelsAsync() => RefreshOllamaModelsInternalAsync(forceUpdate: true);

    public Task SyncOllamaModelsFromBackgroundAsync() => RefreshOllamaModelsInternalAsync(forceUpdate: false);

    private async Task RefreshOllamaModelsInternalAsync(bool forceUpdate)
    {
        if (IsCheckingOllama)
            return;

        IsCheckingOllama = true;
        OllamaModelsHint = string.Empty;
        try
        {
            var status = await _ollamaClient.CheckStatusAsync(OllamaUrl);
            OllamaConnectionState = status.State;
            OllamaStatusText = status.StatusMessage;
            OllamaTroubleshootingTooltip = status.TroubleshootingTooltip;

            if (!forceUpdate && AvailableModels.SequenceEqual(status.InstalledModels))
            {
                if (AvailableModels.Count == 0)
                {
                    OllamaModelsHint = status.IsRunning
                        ? status.HintMessage
                        : status.StatusMessage;
                }
                ModelsRefreshed?.Invoke();
                return;
            }

            var previousModel = OllamaModel;
            _isSyncingModels = true;
            try
            {
                AvailableModels.Clear();
                foreach (var model in status.InstalledModels)
                {
                    AvailableModels.Add(model);
                }

                if (AvailableModels.Count > 0)
                {
                    if (AvailableModels.Contains(previousModel))
                    {
                        OllamaModel = previousModel;
                    }
                    else if (AvailableModels.Contains(AppConstants.DefaultOllamaModel))
                    {
                        OllamaModel = AppConstants.DefaultOllamaModel;
                    }
                    else if (AvailableModels.Contains(AppConstants.FallbackOllamaModel))
                    {
                        OllamaModel = AppConstants.FallbackOllamaModel;
                    }
                    else
                    {
                        OllamaModel = AvailableModels[0];
                    }

                    SelectedOllamaListItem = OllamaModel;

                    if (!string.Equals(previousModel, OllamaModel, StringComparison.Ordinal))
                    {
                        PersistOllamaModelToSettings(OllamaModel);
                    }
                }
                else
                {
                    OllamaModel = previousModel;
                    SelectedOllamaListItem = null;
                    OllamaModelsHint = status.IsRunning
                        ? status.HintMessage
                        : status.StatusMessage;
                }
            }
            finally
            {
                _isSyncingModels = false;
            }

            ModelsRefreshed?.Invoke();
        }
        finally
        {
            IsCheckingOllama = false;
        }
    }

    private bool CanTestClaudeConnection() => !IsCheckingClaude;

    [RelayCommand(CanExecute = nameof(CanTestClaudeConnection))]
    public async Task TestClaudeConnectionAsync()
    {
        if (IsCheckingClaude)
            return;

        IsCheckingClaude = true;
        ClaudeConnectionState = ServiceConnectionState.Checking;
        ClaudeStatusText = LocalizationService.Instance["ConnectionChecking"];
        try
        {
            var status = await _claudeClient.CheckStatusAsync(ClaudeApiKey);
            ApplyClaudeStatus(status);
        }
        finally
        {
            IsCheckingClaude = false;
        }
    }

    public void ApplyClaudeStatus(ClaudeStatus status)
    {
        ClaudeConnectionState = status.State;
        ClaudeStatusText = status.StatusMessage;
        ClaudeTroubleshootingTooltip = status.TroubleshootingTooltip;
    }

    private void PersistOllamaModelToSettings(string model)
    {
        if (string.IsNullOrWhiteSpace(model))
            return;

        var saved = _settingsService.Load();
        if (!string.Equals(saved.OllamaModel, model, StringComparison.Ordinal))
        {
            saved.OllamaModel = model.Trim();
            _settingsService.Save(saved);
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
