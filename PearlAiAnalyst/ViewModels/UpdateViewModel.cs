using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PearlAiAnalyst.Services;
using Velopack;

namespace PearlAiAnalyst.ViewModels;

public sealed partial class UpdateViewModel : ObservableObject
{
    private readonly UpdateService _updateService;
    private readonly UpdateInfo _updateInfo;
    private readonly Action _closeAction;

    [ObservableProperty]
    private string _currentVersionText = $"v{AppConstants.CurrentVersion}";

    [ObservableProperty]
    private string _newVersionText = string.Empty;

    [ObservableProperty]
    private string _releaseNotes = string.Empty;

    [ObservableProperty]
    private bool _isDownloading;

    [ObservableProperty]
    private int _downloadProgress;

    [ObservableProperty]
    private string _errorMessage = string.Empty;

    public UpdateViewModel(
        UpdateService updateService,
        UpdateCheckResult checkResult,
        Action closeAction)
    {
        _updateService = updateService;
        _updateInfo = checkResult.UpdateInfo ?? throw new ArgumentNullException(nameof(checkResult));
        _closeAction = closeAction;

        NewVersionText = $"v{checkResult.NewVersion}";
        ReleaseNotes = checkResult.ReleaseNotes;
    }

    [RelayCommand]
    private async Task UpdateNowAsync()
    {
        if (IsDownloading)
            return;

        IsDownloading = true;
        ErrorMessage = string.Empty;
        DownloadProgress = 0;

        try
        {
            await _updateService.DownloadAndApplyAsync(
                _updateInfo,
                progress => System.Windows.Application.Current?.Dispatcher.InvokeAsync(() => DownloadProgress = progress));
        }
        catch (Exception ex)
        {
            IsDownloading = false;
            ErrorMessage = $"Не удалось загрузить обновление: {ex.Message}";
        }
    }

    [RelayCommand]
    private void Later()
    {
        if (!IsDownloading)
            _closeAction();
    }
}
