namespace PearlAiAnalyst.Models;

public sealed class ClaudeStatus
{
    public ServiceConnectionState State { get; init; } = ServiceConnectionState.Checking;
    public bool IsConnected { get; init; }
    public string StatusMessage { get; init; } = string.Empty;
    public string TroubleshootingTooltip { get; init; } = string.Empty;
}
