using System.ComponentModel;
using System.Windows;
using System.Windows.Media.Animation;
using PearlAiAnalyst.Models;
using PearlAiAnalyst.Services;
using PearlAiAnalyst.ViewModels;
using RadioButton = System.Windows.Controls.RadioButton;

namespace PearlAiAnalyst.Views;

public partial class MainWindow : Window
{
    private readonly MainViewModel _viewModel;
    private readonly SettingsService _settingsService;
    private readonly UpdateService _updateService;
    private bool _allowClose;

    public MainWindow(
        MainViewModel viewModel,
        SettingsService settingsService,
        UpdateService updateService)
    {
        InitializeComponent();
        _viewModel = viewModel;
        _settingsService = settingsService;
        _updateService = updateService;
        DataContext = _viewModel;

        _viewModel.SelectRegionOverlayRequested += HandleSelectRegionRequestedAsync;
        _viewModel.UpdateDialogRequested += HandleUpdateDialogRequested;
        _viewModel.TabChanged += UpdateActiveViewWithAnimation;

        UpdateActiveViewWithAnimation();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        await _viewModel.InitializeAsync();
    }

    private void NavButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is RadioButton rb && int.TryParse(rb.Tag?.ToString(), out var index))
        {
            _viewModel.SelectedTabIndex = index;
        }
    }

    private void UpdateActiveViewWithAnimation()
    {
        var idx = _viewModel.SelectedTabIndex;
        ForecastViewControl.Visibility = idx == 0 ? Visibility.Visible : Visibility.Collapsed;
        NewsViewControl.Visibility = idx == 1 ? Visibility.Visible : Visibility.Collapsed;
        HistoryViewControl.Visibility = idx == 2 ? Visibility.Visible : Visibility.Collapsed;
        SettingsViewControl.Visibility = idx == 3 ? Visibility.Visible : Visibility.Collapsed;

        var fade = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(220))
        {
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut }
        };
        var slide = new DoubleAnimation(16, 0, TimeSpan.FromMilliseconds(220))
        {
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut }
        };

        ScreenHost.BeginAnimation(OpacityProperty, fade);
        if (ScreenHost.RenderTransform is System.Windows.Media.TranslateTransform tt)
        {
            tt.BeginAnimation(System.Windows.Media.TranslateTransform.XProperty, slide);
        }
    }

    private async Task<CaptureRegion?> HandleSelectRegionRequestedAsync()
    {
        var wasVisible = IsVisible;
        if (wasVisible)
            Hide();

        await Task.Delay(150);

        var overlay = new RegionSelectionWindow();
        var confirmed = overlay.ShowDialog() == true;
        var result = confirmed ? overlay.SelectedRegion : null;

        if (wasVisible)
        {
            Show();
            Activate();
        }

        return result;
    }

    private void HandleUpdateDialogRequested(UpdateCheckResult checkResult)
    {
        Dispatcher.Invoke(() =>
        {
            var win = new UpdateWindow
            {
                Owner = this
            };
            win.DataContext = new UpdateViewModel(_updateService, checkResult, () => win.Close());
            win.ShowDialog();
        });
    }

    public void RestoreFromTray()
    {
        Show();
        if (WindowState == WindowState.Minimized)
            WindowState = WindowState.Normal;
        Activate();
    }

    public void ForceExit()
    {
        _allowClose = true;
        Close();
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (_allowClose)
            return;

        var settings = _settingsService.Load();
        if (settings.MinimizeToTrayOnClose)
        {
            e.Cancel = true;
            Hide();
        }
    }
}
