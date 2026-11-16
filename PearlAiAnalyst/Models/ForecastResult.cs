namespace PearlAiAnalyst.Models;

public sealed class ForecastResult
{
    public double? PriceNow { get; set; }
    public ForecastDirection Direction { get; set; } = ForecastDirection.Unknown;
    public int Confidence { get; set; }
    public List<double> Support { get; set; } = [];
    public List<double> Resistance { get; set; } = [];
    public double? TargetPrice { get; set; }
    public double? StopPrice { get; set; }
    public List<string> ChartReasons { get; set; } = [];
    public string NewsImpact { get; set; } = string.Empty;
    public List<string> NewsReasons { get; set; } = [];
    public List<string> Risks { get; set; } = [];

    public string ModelName { get; set; } = string.Empty;
    public string ProviderName { get; set; } = string.Empty;
    public long ResponseTimeMs { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string ScreenshotPath { get; set; } = string.Empty;
    public string RawJson { get; set; } = string.Empty;
}
