using System.Windows;
using PearlAiAnalyst.Services;
using PearlAiAnalyst.ViewModels;
using PearlAiAnalyst.Views;
using Application = System.Windows.Application;

namespace PearlAiAnalyst;

public partial class App : Application
{
    private LoggerService? _logger;
    private TrayNotificationService? _trayService;
    private MainViewModel? _mainViewModel;
    private MainWindow? _mainWindow;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _logger = new LoggerService();
        _logger.Info($"Запуск {AppConstants.AppName} v{AppConstants.CurrentVersion}");

        DispatcherUnhandledException += (_, args) =>
        {
            _logger?.Error("Необработанное исключение UI потока.", args.Exception);
            System.Windows.MessageBox.Show(
                $"Произошла непредвиденная ошибка:\n{args.Exception.Message}",
                AppConstants.AppName,
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            args.Handled = true;
        };

        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            if (args.ExceptionObject is Exception ex)
                _logger?.Error("Критическое необработанное исключение домена.", ex);
        };

        var settingsService = new SettingsService(_logger);
        var screenCaptureService = new ScreenCaptureService(_logger);
        var newsService = new NewsService(_logger);
        var ollamaClient = new OllamaClient(_logger);
        var claudeClient = new ClaudeClient(_logger);
        var historyRepository = new HistoryRepository(_logger);
        var updateService = new UpdateService(_logger);
        _trayService = new TrayNotificationService();

        _mainViewModel = new MainViewModel(
            _logger,
            settingsService,
            screenCaptureService,
            newsService,
            ollamaClient,
            claudeClient,
            historyRepository,
            updateService,
            _trayService);

        _mainWindow = new MainWindow(_mainViewModel, settingsService, updateService);
        MainWindow = _mainWindow;

        _trayService.OpenRequested += () => Dispatcher.Invoke(() => _mainWindow.RestoreFromTray());
        _trayService.AnalyzeRequested += () => Dispatcher.Invoke(async () => await _mainViewModel.RunAnalysisAsync());
        _trayService.ExitRequested += () => Dispatcher.Invoke(() => _mainWindow.ForceExit());

        _mainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _mainViewModel?.Dispose();
        _trayService?.Dispose();
        _logger?.Info("Завершение работы приложения.");
        base.OnExit(e);
    }
}
