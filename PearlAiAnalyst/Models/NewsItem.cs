namespace PearlAiAnalyst.Models;

public sealed class NewsItem
{
    public string Title { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string Link { get; set; } = string.Empty;
    public DateTimeOffset? PublishedAt { get; set; }
    public string MatchedQuery { get; set; } = string.Empty;

    public string FormattedDate => PublishedAt.HasValue
        ? PublishedAt.Value.ToLocalTime().ToString("dd.MM.yyyy HH:mm")
        : "нет данных";
}
