using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PearlAiAnalyst.Models;
using PearlAiAnalyst.Services;

namespace PearlAiAnalyst.ViewModels;

public sealed partial class NewsViewModel : ObservableObject
{
    private readonly NewsService _newsService;
    private readonly SettingsService _settingsService;
    private readonly LoggerService _logger;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private bool _isEmpty = true;

    [ObservableProperty]
    private string _lastUpdatedText = LocalizationService.Instance["NoData"];

    [ObservableProperty]
    private string _errorMessage = string.Empty;

    public ObservableCollection<NewsItem> Items { get; } = [];

    public NewsViewModel(NewsService newsService, SettingsService settingsService, LoggerService logger)
    {
        _newsService = newsService;
        _settingsService = settingsService;
        _logger = logger;
    }

    public void UpdateFromItems(IReadOnlyList<NewsItem> news)
    {
        Items.Clear();
        foreach (var item in news)
        {
            Items.Add(item);
        }

        IsEmpty = Items.Count == 0;
        LastUpdatedText = DateTime.Now.ToString("dd.MM.yyyy HH:mm:ss");
    }

    [RelayCommand]
    public async Task RefreshNewsAsync()
    {
        if (IsLoading)
            return;

        IsLoading = true;
        ErrorMessage = string.Empty;
        try
        {
            var settings = _settingsService.Load();
            var result = await _newsService.FetchNewsWithDiagnosticsAsync(settings.RssFeeds, settings.NewsKeywords);
            UpdateFromItems(result.Items);

            if (result.Items.Count == 0 && result.Errors.Count > 0)
            {
                ErrorMessage = $"Не удалось загрузить новости: {string.Join(" ", result.Errors)}";
            }
        }
        catch (Exception ex)
        {
            _logger.Error("Ошибка обновления новостей.", ex);
            ErrorMessage = $"Не удалось загрузить новости: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private void OpenArticle(NewsItem? item)
    {
        if (item is null || string.IsNullOrWhiteSpace(item.Link))
            return;

        if (!Uri.TryCreate(item.Link, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri)
            {
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            _logger.Error($"Не удалось открыть ссылку новости: {item.Link}", ex);
        }
    }
}
