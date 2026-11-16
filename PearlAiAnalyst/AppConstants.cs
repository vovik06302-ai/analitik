using System.IO;
using System.Reflection;

namespace PearlAiAnalyst;

public static class AppConstants
{
    public const string AppName = "Pearl AI Analyst";
    public const string AppId = "PearlAiAnalyst";
    public const string DefaultGitHubRepoUrl = "https://github.com/vovik06302-ai/pearl-rig-core";

    public const string DefaultOllamaUrl = "http://localhost:11434";
    public const string DefaultOllamaModel = "qwen2.5vl:32b";
    public const string FallbackOllamaModel = "qwen2.5vl:7b";
    public const string DefaultClaudeModel = "claude-sonnet-4-20250514";

    public static readonly string[] DefaultClaudeModels =
    [
        "claude-sonnet-4-20250514",
        "claude-opus-4-20250514",
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022"
    ];

    public static readonly string[] DefaultNewsKeywords =
    [
        "Pearl PRL",
        "Pearl Research Labs"
    ];

    public static string AppDataDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), AppId);

    public static string ShotsDirectory => Path.Combine(AppDataDirectory, "shots");
    public static string LogsDirectory => Path.Combine(AppDataDirectory, "logs");
    public static string SettingsFilePath => Path.Combine(AppDataDirectory, "settings.json");
    public static string SecretsFilePath => Path.Combine(AppDataDirectory, "claude_key.dpapi");
    public static string DatabaseFilePath => Path.Combine(AppDataDirectory, "history.db");

    public static string GitHubRepoUrl
    {
        get
        {
            var assembly = Assembly.GetExecutingAssembly();
            var repoUrl = assembly
                .GetCustomAttributes<AssemblyMetadataAttribute>()
                .FirstOrDefault(attr => string.Equals(attr.Key, "GitHubRepoUrl", StringComparison.OrdinalIgnoreCase))
                ?.Value;

            return !string.IsNullOrWhiteSpace(repoUrl)
                ? repoUrl.Trim().TrimEnd('/')
                : DefaultGitHubRepoUrl;
        }
    }

    public static string CurrentVersion
    {
        get
        {
            var assembly = Assembly.GetExecutingAssembly();
            var infoVersion = assembly
                .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
                ?.InformationalVersion;

            if (!string.IsNullOrWhiteSpace(infoVersion))
            {
                var plusIndex = infoVersion.IndexOf('+');
                return plusIndex > 0 ? infoVersion[..plusIndex] : infoVersion;
            }

            var version = assembly.GetName().Version;
            return version is not null
                ? $"{version.Major}.{version.Minor}.{version.Build}"
                : "1.0.0";
        }
    }
}
