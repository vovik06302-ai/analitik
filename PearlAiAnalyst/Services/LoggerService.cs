using System.IO;
using System.Text;

namespace PearlAiAnalyst.Services;

public sealed class LoggerService
{
    private readonly Lock _syncLock = new();

    public LoggerService()
    {
        try
        {
            Directory.CreateDirectory(AppConstants.LogsDirectory);
        }
        catch
        {
            // Ignore directory creation errors during early static initialization
        }
    }

    public void Info(string message) => Write("INFO", message);
    public void Warning(string message) => Write("WARN", message);

    public void Error(string message, Exception? ex = null)
    {
        var fullMessage = ex is null
            ? message
            : $"{message} | {ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}";
        Write("ERROR", fullMessage);
    }

    private void Write(string level, string message)
    {
        try
        {
            lock (_syncLock)
            {
                Directory.CreateDirectory(AppConstants.LogsDirectory);
                var filePath = Path.Combine(
                    AppConstants.LogsDirectory,
                    $"app_{DateTime.Now:yyyyMMdd}.log");

                var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{level}] {message}{Environment.NewLine}";
                File.AppendAllText(filePath, line, Encoding.UTF8);
            }
        }
        catch
        {
            // Logging must never crash the application
        }
    }
}
