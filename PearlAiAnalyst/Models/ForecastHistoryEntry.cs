namespace PearlAiAnalyst.Models;

public sealed class ForecastHistoryEntry
{
    public long Id { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public double? PriceNow { get; set; }
    public ForecastDirection Direction { get; set; }
    public int Confidence { get; set; }
    public double? TargetPrice { get; set; }
    public double? StopPrice { get; set; }
    public string SupportText { get; set; } = string.Empty;
    public string ResistanceText { get; set; } = string.Empty;
    public string ChartReasons { get; set; } = string.Empty;
    public string NewsImpact { get; set; } = string.Empty;
    public string NewsReasons { get; set; } = string.Empty;
    public string Risks { get; set; } = string.Empty;
    public string ModelName { get; set; } = string.Empty;
    public string ProviderName { get; set; } = string.Empty;
    public long ResponseTimeMs { get; set; }
    public string ScreenshotPath { get; set; } = string.Empty;

    public string FormattedLocalTime => CreatedAtUtc.ToLocalTime().ToString("dd.MM.yyyy HH:mm:ss");
    public string FormattedResponseTime => ResponseTimeMs > 0 ? $"{ResponseTimeMs / 1000.0:F1} с" : "нет данных";
}
