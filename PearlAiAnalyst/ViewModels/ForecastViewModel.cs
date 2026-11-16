using System.Collections.ObjectModel;
using System.Globalization;
using System.IO;
using System.Windows.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using PearlAiAnalyst.Models;
using PearlAiAnalyst.Services;

namespace PearlAiAnalyst.ViewModels;

public sealed partial class ForecastViewModel : ObservableObject
{
    [ObservableProperty]
    private bool _hasForecast;

    [ObservableProperty]
    private ForecastDirection _direction = ForecastDirection.Unknown;

    [ObservableProperty]
    private int _confidence;

    [ObservableProperty]
    private string _priceNowText = LocalizationService.Instance["NoData"];

    [ObservableProperty]
    private string _targetPriceText = LocalizationService.Instance["NoData"];

    [ObservableProperty]
    private string _stopPriceText = LocalizationService.Instance["NoData"];

    [ObservableProperty]
    private string _supportText = LocalizationService.Instance["NoData"];

    [ObservableProperty]
    private string _resistanceText = LocalizationService.Instance["NoData"];

    [ObservableProperty]
    private string _newsImpactText = LocalizationService.Instance["NoData"];

    [ObservableProperty]
    private string _modelInfoText = LocalizationService.Instance["NoData"];

    [ObservableProperty]
    private string _responseTimeText = LocalizationService.Instance["NoData"];

    [ObservableProperty]
    private string _updatedAtText = LocalizationService.Instance["NoData"];

    [ObservableProperty]
    private BitmapImage? _screenshotPreview;

    [ObservableProperty]
    private string _screenshotPathText = string.Empty;

    public ObservableCollection<string> ChartReasons { get; } = [];
    public ObservableCollection<string> NewsReasons { get; } = [];
    public ObservableCollection<string> Risks { get; } = [];

    public event Action? ForecastUpdated;

    public void ApplyForecast(ForecastResult result)
    {
        var noData = LocalizationService.Instance["NoData"];

        HasForecast = true;
        Direction = result.Direction;
        Confidence = result.Confidence;
        PriceNowText = FormatPrice(result.PriceNow, noData);
        TargetPriceText = FormatPrice(result.TargetPrice, noData);
        StopPriceText = FormatPrice(result.StopPrice, noData);

        SupportText = result.Support.Count > 0
            ? string.Join("  •  ", result.Support.Select(v => v.ToString("0.########", CultureInfo.InvariantCulture)))
            : noData;

        ResistanceText = result.Resistance.Count > 0
            ? string.Join("  •  ", result.Resistance.Select(v => v.ToString("0.########", CultureInfo.InvariantCulture)))
            : noData;

        NewsImpactText = string.IsNullOrWhiteSpace(result.NewsImpact) ? noData : result.NewsImpact;
        ModelInfoText = $"{result.ProviderName} / {result.ModelName}";
        ResponseTimeText = $"{result.ResponseTimeMs / 1000.0:F1} с ({result.ResponseTimeMs} мс)";
        UpdatedAtText = result.CreatedAtUtc.ToLocalTime().ToString("dd.MM.yyyy HH:mm:ss");

        ChartReasons.Clear();
        if (result.ChartReasons.Count > 0)
        {
            foreach (var r in result.ChartReasons) ChartReasons.Add(r);
        }
        else
        {
            ChartReasons.Add(noData);
        }

        NewsReasons.Clear();
        if (result.NewsReasons.Count > 0)
        {
            foreach (var r in result.NewsReasons) NewsReasons.Add(r);
        }
        else
        {
            NewsReasons.Add(noData);
        }

        Risks.Clear();
        if (result.Risks.Count > 0)
        {
            foreach (var r in result.Risks) Risks.Add(r);
        }
        else
        {
            Risks.Add(noData);
        }

        SetScreenshotPreview(result.ScreenshotPath);
        ForecastUpdated?.Invoke();
    }

    public void SetScreenshotPreview(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return;

        try
        {
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.UriSource = new Uri(path, UriKind.Absolute);
            bitmap.EndInit();
            bitmap.Freeze();

            ScreenshotPreview = bitmap;
            ScreenshotPathText = path;
        }
        catch
        {
            // Ignore preview load error if file is unreadable
        }
    }

    private static string FormatPrice(double? price, string noData)
    {
        return price.HasValue && double.IsFinite(price.Value)
            ? price.Value.ToString("0.########", CultureInfo.InvariantCulture)
            : noData;
    }
}
