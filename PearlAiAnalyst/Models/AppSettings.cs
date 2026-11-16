namespace PearlAiAnalyst.Models;

public sealed class AppSettings
{
    public CaptureRegion CaptureRegion { get; set; } = new();
    public int AutoIntervalMinutes { get; set; } = 15;
    public bool AutoModeEnabled { get; set; }

    public AiProviderType Provider { get; set; } = AiProviderType.Ollama;
    public string OllamaUrl { get; set; } = AppConstants.DefaultOllamaUrl;
    public string OllamaModel { get; set; } = AppConstants.DefaultOllamaModel;
    public string ClaudeModel { get; set; } = AppConstants.DefaultClaudeModel;

    public List<string> RssFeeds { get; set; } = [];
    public List<string> NewsKeywords { get; set; } = [.. AppConstants.DefaultNewsKeywords];

    public bool NotifyOnDirectionChange { get; set; } = true;
    public int NotifyConfidenceThreshold { get; set; } = 70;
    public bool MinimizeToTrayOnClose { get; set; } = true;
    public bool AutoStartWithWindows { get; set; }
    public string Language { get; set; } = "ru";
}
