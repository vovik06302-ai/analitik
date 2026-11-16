using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using PearlAiAnalyst.Models;
using PearlAiAnalyst.Services;
using Brush = System.Windows.Media.Brush;
using Brushes = System.Windows.Media.Brushes;
using Color = System.Windows.Media.Color;

namespace PearlAiAnalyst.Converters;

public sealed class BoolToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is true ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is Visibility.Visible;
}

public sealed class InverseBoolToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is true ? Visibility.Collapsed : Visibility.Visible;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is Visibility.Collapsed;
}

public sealed class InverseBoolConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is bool b ? !b : true;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is bool b ? !b : false;
}

public sealed class NullOrEmptyToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var invert = string.Equals(parameter as string, "Invert", StringComparison.OrdinalIgnoreCase);
        var isEmpty = value is null || (value is string s && string.IsNullOrWhiteSpace(s));
        var visible = invert ? isEmpty : !isEmpty;
        return visible ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class DirectionToTextConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var loc = LocalizationService.Instance;
        return value is ForecastDirection dir
            ? dir switch
            {
                ForecastDirection.Up => loc["DirectionUp"],
                ForecastDirection.Down => loc["DirectionDown"],
                ForecastDirection.Sideways => loc["DirectionSideways"],
                _ => loc["DirectionUnknown"]
            }
            : loc["DirectionUnknown"];
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class DirectionToBrushConverter : IValueConverter
{
    private static readonly Brush UpBrush = new SolidColorBrush(Color.FromRgb(0x22, 0xC5, 0x5E));
    private static readonly Brush DownBrush = new SolidColorBrush(Color.FromRgb(0xEF, 0x44, 0x44));
    private static readonly Brush SidewaysBrush = new SolidColorBrush(Color.FromRgb(0xF5, 0x9E, 0x0B));
    private static readonly Brush NeutralBrush = new SolidColorBrush(Color.FromRgb(0x64, 0x74, 0x8B));

    static DirectionToBrushConverter()
    {
        UpBrush.Freeze();
        DownBrush.Freeze();
        SidewaysBrush.Freeze();
        NeutralBrush.Freeze();
    }

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        return value is ForecastDirection dir
            ? dir switch
            {
                ForecastDirection.Up => UpBrush,
                ForecastDirection.Down => DownBrush,
                ForecastDirection.Sideways => SidewaysBrush,
                _ => NeutralBrush
            }
            : NeutralBrush;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class DirectionToTintBrushConverter : IValueConverter
{
    private static readonly Brush UpTint = new SolidColorBrush(Color.FromArgb(0x28, 0x22, 0xC5, 0x5E));
    private static readonly Brush DownTint = new SolidColorBrush(Color.FromArgb(0x28, 0xEF, 0x44, 0x44));
    private static readonly Brush SidewaysTint = new SolidColorBrush(Color.FromArgb(0x28, 0xF5, 0x9E, 0x0B));
    private static readonly Brush NeutralTint = new SolidColorBrush(Color.FromArgb(0x22, 0x64, 0x74, 0x8B));

    static DirectionToTintBrushConverter()
    {
        UpTint.Freeze();
        DownTint.Freeze();
        SidewaysTint.Freeze();
        NeutralTint.Freeze();
    }

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        return value is ForecastDirection dir
            ? dir switch
            {
                ForecastDirection.Up => UpTint,
                ForecastDirection.Down => DownTint,
                ForecastDirection.Sideways => SidewaysTint,
                _ => NeutralTint
            }
            : NeutralTint;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class DirectionToGeometryConverter : IValueConverter
{
    private static readonly Geometry UpArrow = Geometry.Parse("M 12,2 L 22,12 L 16,12 L 16,22 L 8,22 L 8,12 L 2,12 Z");
    private static readonly Geometry DownArrow = Geometry.Parse("M 8,2 L 16,2 L 16,12 L 22,12 L 12,22 L 2,12 L 8,12 Z");
    private static readonly Geometry SidewaysArrow = Geometry.Parse("M 2,12 L 8,6 L 8,10 L 16,10 L 16,6 L 22,12 L 16,18 L 16,14 L 8,14 L 8,18 Z");
    private static readonly Geometry QuestionMark = Geometry.Parse("M 12,4 A 8,8 0 1 1 11.99,4 Z");

    static DirectionToGeometryConverter()
    {
        UpArrow.Freeze();
        DownArrow.Freeze();
        SidewaysArrow.Freeze();
        QuestionMark.Freeze();
    }

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        return value is ForecastDirection dir
            ? dir switch
            {
                ForecastDirection.Up => UpArrow,
                ForecastDirection.Down => DownArrow,
                ForecastDirection.Sideways => SidewaysArrow,
                _ => QuestionMark
            }
            : QuestionMark;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class NullablePriceConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is double d && double.IsFinite(d))
            return d.ToString("0.########", CultureInfo.InvariantCulture);

        return LocalizationService.Instance["NoData"];
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class ProviderEqualsConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is AiProviderType provider && parameter is string target &&
            Enum.TryParse<AiProviderType>(target, true, out var targetEnum))
        {
            return provider == targetEnum ? Visibility.Visible : Visibility.Collapsed;
        }
        return Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
