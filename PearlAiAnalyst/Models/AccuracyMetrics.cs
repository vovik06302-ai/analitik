namespace PearlAiAnalyst.Models;

public sealed class HorizonAccuracy
{
    public int Hours { get; init; }
    public int EvaluableCount { get; init; }
    public int CorrectCount { get; init; }
    public double? AccuracyPercent { get; init; }
    public bool HasSufficientData { get; init; }
}

public sealed class AccuracyMetrics
{
    public HorizonAccuracy OneHour { get; init; } = new() { Hours = 1 };
    public HorizonAccuracy TwoHours { get; init; } = new() { Hours = 2 };
    public HorizonAccuracy FourHours { get; init; } = new() { Hours = 4 };
}
