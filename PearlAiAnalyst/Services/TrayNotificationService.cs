using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using PearlAiAnalyst.Models;

namespace PearlAiAnalyst.Services;

public sealed class TrayNotificationService : IDisposable
{
    private readonly NotifyIcon _notifyIcon;
    private readonly Icon _appIcon;
    private readonly ToolStripMenuItem _openMenuItem;
    private readonly ToolStripMenuItem _analyzeMenuItem;
    private readonly ToolStripMenuItem _exitMenuItem;

    public event Action? OpenRequested;
    public event Action? AnalyzeRequested;
    public event Action? ExitRequested;

    public TrayNotificationService()
    {
        _appIcon = CreatePearlIcon();

        _openMenuItem = new ToolStripMenuItem(LocalizationService.Instance["TrayOpen"]);
        _openMenuItem.Click += (_, _) => OpenRequested?.Invoke();

        _analyzeMenuItem = new ToolStripMenuItem(LocalizationService.Instance["TrayAnalyze"]);
        _analyzeMenuItem.Click += (_, _) => AnalyzeRequested?.Invoke();

        _exitMenuItem = new ToolStripMenuItem(LocalizationService.Instance["TrayExit"]);
        _exitMenuItem.Click += (_, _) => ExitRequested?.Invoke();

        var menu = new ContextMenuStrip();
        menu.Items.Add(_openMenuItem);
        menu.Items.Add(_analyzeMenuItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(_exitMenuItem);

        _notifyIcon = new NotifyIcon
        {
            Icon = _appIcon,
            Text = AppConstants.AppName,
            ContextMenuStrip = menu,
            Visible = true
        };

        _notifyIcon.DoubleClick += (_, _) => OpenRequested?.Invoke();
    }

    public void RefreshMenuText()
    {
        _openMenuItem.Text = LocalizationService.Instance["TrayOpen"];
        _analyzeMenuItem.Text = LocalizationService.Instance["TrayAnalyze"];
        _exitMenuItem.Text = LocalizationService.Instance["TrayExit"];
    }

    public void ShowForecastNotification(ForecastResult result, bool directionChanged)
    {
        var dirLabel = result.Direction switch
        {
            ForecastDirection.Up => "ВВЕРХ ↑",
            ForecastDirection.Down => "ВНИЗ ↓",
            ForecastDirection.Sideways => "БОКОВИК →",
            _ => "нет данных"
        };

        var title = directionChanged
            ? $"Pearl AI Analyst: смена направления → {dirLabel}"
            : $"Pearl AI Analyst: прогноз {dirLabel}";

        var pricePart = result.PriceNow.HasValue ? $"Цена: {result.PriceNow.Value:G6} • " : string.Empty;
        var body = $"{pricePart}Уверенность: {result.Confidence}% ({result.ModelName}). Приблизительная оценка, не финансовый совет.";

        _notifyIcon.ShowBalloonTip(5000, title, body, ToolTipIcon.Info);
    }

    private static Icon CreatePearlIcon()
    {
        using var bmp = new Bitmap(32, 32);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);

        using var bgBrush = new SolidBrush(Color.FromArgb(18, 23, 34));
        g.FillEllipse(bgBrush, 1, 1, 30, 30);

        using var borderPen = new Pen(Color.FromArgb(0, 212, 170), 2.5f);
        g.DrawEllipse(borderPen, 2, 2, 28, 28);

        using var innerBrush = new SolidBrush(Color.FromArgb(0, 212, 170));
        g.FillEllipse(innerBrush, 10, 10, 12, 12);

        var hIcon = bmp.GetHicon();
        return Icon.FromHandle(hIcon);
    }

    public void Dispose()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        _appIcon.Dispose();
    }
}
