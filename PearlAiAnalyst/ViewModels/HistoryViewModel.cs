using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PearlAiAnalyst.Models;
using PearlAiAnalyst.Services;

namespace PearlAiAnalyst.ViewModels;

public sealed partial class HistoryViewModel : ObservableObject
{
    private readonly HistoryRepository _repository;
    private readonly LoggerService _logger;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private bool _isEmpty = true;

    [ObservableProperty]
    private ForecastHistoryEntry? _selectedEntry;

    [ObservableProperty]
    private string _accuracy1hText = LocalizationService.Instance["InsufficientData"];

    [ObservableProperty]
    private string _accuracy1hSubText = "оценено: 0 (мин. 3)";

    [ObservableProperty]
    private string _accuracy2hText = LocalizationService.Instance["InsufficientData"];

    [ObservableProperty]
    private string _accuracy2hSubText = "оценено: 0 (мин. 3)";

    [ObservableProperty]
    private string _accuracy4hText = LocalizationService.Instance["InsufficientData"];

    [ObservableProperty]
    private string _accuracy4hSubText = "оценено: 0 (мин. 3)";

    [ObservableProperty]
    private string _statusMessage = string.Empty;

    public ObservableCollection<ForecastHistoryEntry> Entries { get; } = [];

    public HistoryViewModel(HistoryRepository repository, LoggerService logger)
    {
        _repository = repository;
        _logger = logger;
    }

    [RelayCommand]
    public async Task LoadHistoryAsync()
    {
        if (IsLoading)
            return;

        IsLoading = true;
        StatusMessage = string.Empty;
        try
        {
            var items = await _repository.GetAllAsync();
            Entries.Clear();
            foreach (var item in items)
            {
                Entries.Add(item);
            }

            IsEmpty = Entries.Count == 0;

            var metrics = _repository.CalculateAccuracy(items);
            UpdateHorizonDisplay(metrics.OneHour, v => Accuracy1hText = v, v => Accuracy1hSubText = v);
            UpdateHorizonDisplay(metrics.TwoHours, v => Accuracy2hText = v, v => Accuracy2hSubText = v);
            UpdateHorizonDisplay(metrics.FourHours, v => Accuracy4hText = v, v => Accuracy4hSubText = v);
        }
        catch (Exception ex)
        {
            _logger.Error("Ошибка загрузки истории прогнозов из SQLite.", ex);
            StatusMessage = $"Ошибка чтения истории: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    private static void UpdateHorizonDisplay(HorizonAccuracy horizon, Action<string> setMain, Action<string> setSub)
    {
        if (horizon.HasSufficientData && horizon.AccuracyPercent.HasValue)
        {
            setMain($"{horizon.AccuracyPercent.Value:F1}%");
            setSub($"верно {horizon.CorrectCount} из {horizon.EvaluableCount}");
        }
        else
        {
            setMain(LocalizationService.Instance["InsufficientData"]);
            setSub($"оценено: {horizon.EvaluableCount} (мин. 3)");
        }
    }

    [RelayCommand]
    private async Task ExportCsvAsync()
    {
        if (Entries.Count == 0)
        {
            StatusMessage = "Нет записей для экспорта.";
            return;
        }

        var dialog = new Microsoft.Win32.SaveFileDialog
        {
            Title = "Экспорт истории прогнозов в CSV",
            Filter = "CSV файлы (*.csv)|*.csv",
            FileName = $"pearl_ai_history_{DateTime.Now:yyyyMMdd_HHmm}.csv"
        };

        if (dialog.ShowDialog() != true)
            return;

        try
        {
            await _repository.ExportCsvAsync(dialog.FileName, Entries);
            StatusMessage = $"Экспорт завершён: {dialog.FileName}";
        }
        catch (Exception ex)
        {
            _logger.Error("Ошибка экспорта истории в CSV.", ex);
            StatusMessage = $"Ошибка экспорта: {ex.Message}";
        }
    }
}
