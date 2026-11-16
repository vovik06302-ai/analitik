using System.Windows;
using System.Windows.Media.Animation;
using PearlAiAnalyst.ViewModels;
using UserControl = System.Windows.Controls.UserControl;

namespace PearlAiAnalyst.Views;

public partial class ForecastView : UserControl
{
    private ForecastViewModel? _subscribedVm;

    public ForecastView()
    {
        InitializeComponent();
    }

    private void UserControl_DataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (_subscribedVm is not null)
            _subscribedVm.ForecastUpdated -= OnForecastUpdated;

        _subscribedVm = e.NewValue as ForecastViewModel;
        if (_subscribedVm is not null)
            _subscribedVm.ForecastUpdated += OnForecastUpdated;
    }

    private void OnForecastUpdated()
    {
        Dispatcher.Invoke(() =>
        {
            var anim = new DoubleAnimation
            {
                From = 0,
                To = _subscribedVm?.Confidence ?? 0,
                Duration = TimeSpan.FromMilliseconds(550),
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut }
            };
            ConfidenceBar.BeginAnimation(System.Windows.Controls.Primitives.RangeBase.ValueProperty, anim);
        });
    }
}
