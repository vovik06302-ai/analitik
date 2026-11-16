namespace PearlAiAnalyst.Models;

public sealed class OllamaStatus
{
    public bool IsRunning { get; init; }
    public string StatusMessage { get; init; } = string.Empty;
    public string HintMessage { get; init; } = string.Empty;
    public List<string> InstalledModels { get; init; } = [];
}
