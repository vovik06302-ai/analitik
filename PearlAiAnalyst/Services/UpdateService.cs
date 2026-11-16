using System.Net.Http;
using Velopack;
using Velopack.Sources;

namespace PearlAiAnalyst.Services;

public enum UpdateCheckStatus
{
    UpToDate,
    UpdateAvailable,
    NotInstalled,
    Error
}

public sealed class UpdateCheckResult
{
    public UpdateCheckStatus Status { get; init; }
    public UpdateInfo? UpdateInfo { get; init; }
    public string NewVersion { get; init; } = string.Empty;
    public string ReleaseNotes { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
}

public sealed class UpdateService
{
    private readonly LoggerService _logger;

    public UpdateService(LoggerService logger)
    {
        _logger = logger;
    }

    private static UpdateManager CreateManager()
    {
        var source = new GithubSource(AppConstants.GitHubRepoUrl, accessToken: null, prerelease: false);
        var options = new UpdateOptions
        {
            ExplicitChannel = "win"
        };
        return new UpdateManager(source, options);
    }

    public async Task<UpdateCheckResult> CheckForUpdatesAsync()
    {
        try
        {
            var mgr = CreateManager();
            if (!mgr.IsInstalled)
            {
                _logger.Info("Проверка обновлений пропущена: приложение запущено не из установщика Velopack.");
                return new UpdateCheckResult
                {
                    Status = UpdateCheckStatus.NotInstalled,
                    Message = $"Приложение запущено без установщика Velopack. Установите свежий релиз из {AppConstants.GitHubRepoUrl}/releases/latest."
                };
            }

            _logger.Info($"Проверка обновлений: repo={AppConstants.GitHubRepoUrl}, current={mgr.CurrentVersion}, channel={mgr.Channel}");
            var updateInfo = await mgr.CheckForUpdatesAsync();
            if (updateInfo is null)
            {
                _logger.Info($"Обновлений не найдено: установлена актуальная версия v{mgr.CurrentVersion}.");
                return new UpdateCheckResult
                {
                    Status = UpdateCheckStatus.UpToDate,
                    Message = LocalizationService.Instance["UpdateUpToDate"]
                };
            }

            var newVersion = updateInfo.TargetFullRelease.Version.ToString();
            var notes = string.IsNullOrWhiteSpace(updateInfo.TargetFullRelease.NotesMarkdown)
                ? "Список изменений не указан в описании релиза."
                : updateInfo.TargetFullRelease.NotesMarkdown.Trim();

            _logger.Info($"Найдено обновление: {newVersion}");
            return new UpdateCheckResult
            {
                Status = UpdateCheckStatus.UpdateAvailable,
                UpdateInfo = updateInfo,
                NewVersion = newVersion,
                ReleaseNotes = notes,
                Message = $"Доступна новая версия: v{newVersion}"
            };
        }
        catch (HttpRequestException ex)
        {
            _logger.Warning($"Ошибка сети при проверке обновлений GitHub: {ex.Message}");
            return new UpdateCheckResult
            {
                Status = UpdateCheckStatus.Error,
                Message = "Не удалось проверить обновления: нет интернета или GitHub недоступен."
            };
        }
        catch (TaskCanceledException ex)
        {
            _logger.Warning($"Таймаут при проверке обновлений GitHub: {ex.Message}");
            return new UpdateCheckResult
            {
                Status = UpdateCheckStatus.Error,
                Message = "Превышено время ожидания ответа от GitHub."
            };
        }
        catch (Exception ex)
        {
            _logger.Error("Непредвиденная ошибка при проверке обновлений.", ex);
            return new UpdateCheckResult
            {
                Status = UpdateCheckStatus.Error,
                Message = $"Ошибка проверки обновлений: {ex.Message}"
            };
        }
    }

    public async Task DownloadAndApplyAsync(UpdateInfo updateInfo, Action<int> onProgress)
    {
        var mgr = CreateManager();
        await mgr.DownloadUpdatesAsync(updateInfo, progress => onProgress(progress));
        _logger.Info($"Обновление {updateInfo.TargetFullRelease.Version} загружено, выполняется перезапуск.");
        mgr.ApplyUpdatesAndRestart(updateInfo);
    }
}
