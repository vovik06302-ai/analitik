using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using PearlAiAnalyst.Models;
using PearlAiAnalyst.Services;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using MouseEventArgs = System.Windows.Input.MouseEventArgs;
using Point = System.Windows.Point;

namespace PearlAiAnalyst.Views;

public partial class RegionSelectionWindow : Window
{
    private Point? _startPointDip;
    private bool _isDragging;

    public CaptureRegion? SelectedRegion { get; private set; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int x,
        int y,
        int cx,
        int cy,
        uint uFlags);

    public RegionSelectionWindow()
    {
        InitializeComponent();
        SourceInitialized += RegionSelectionWindow_SourceInitialized;
    }

    private void RegionSelectionWindow_SourceInitialized(object? sender, EventArgs e)
    {
        var bounds = ScreenCaptureService.GetVirtualScreenPhysicalBounds();
        var hwnd = new WindowInteropHelper(this).Handle;
        SetWindowPos(hwnd, new IntPtr(-1), bounds.X, bounds.Y, bounds.Width, bounds.Height, 0x0040);
    }

    private void Canvas_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        _startPointDip = e.GetPosition(SelectionCanvas);
        _isDragging = true;
        SelectionCanvas.CaptureMouse();

        SelectionRectBorder.Visibility = Visibility.Visible;
        SizeBadge.Visibility = Visibility.Visible;
        UpdateVisualSelection(_startPointDip.Value, _startPointDip.Value);
    }

    private void Canvas_MouseMove(object sender, MouseEventArgs e)
    {
        if (!_isDragging || !_startPointDip.HasValue)
            return;

        var current = e.GetPosition(SelectionCanvas);
        UpdateVisualSelection(_startPointDip.Value, current);
    }

    private void Canvas_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (!_isDragging || !_startPointDip.HasValue)
            return;

        _isDragging = false;
        SelectionCanvas.ReleaseMouseCapture();

        var endDip = e.GetPosition(SelectionCanvas);
        var region = ComputePhysicalRegion(_startPointDip.Value, endDip);

        if (region.IsValid)
        {
            SelectedRegion = region;
            DialogResult = true;
        }
        else
        {
            SelectedRegion = null;
            DialogResult = false;
        }
        Close();
    }

    private void UpdateVisualSelection(Point p1, Point p2)
    {
        var left = Math.Min(p1.X, p2.X);
        var top = Math.Min(p1.Y, p2.Y);
        var width = Math.Abs(p2.X - p1.X);
        var height = Math.Abs(p2.Y - p1.Y);

        Canvas.SetLeft(SelectionRectBorder, left);
        Canvas.SetTop(SelectionRectBorder, top);
        SelectionRectBorder.Width = width;
        SelectionRectBorder.Height = height;

        var physical = ComputePhysicalRegion(p1, p2);
        SizeBadgeText.Text = $"{physical.Width} × {physical.Height} px";
        Canvas.SetLeft(SizeBadge, left);
        Canvas.SetTop(SizeBadge, Math.Max(8, top - 28));
    }

    private CaptureRegion ComputePhysicalRegion(Point dip1, Point dip2)
    {
        var topLeftDip = new Point(Math.Min(dip1.X, dip2.X), Math.Min(dip1.Y, dip2.Y));
        var bottomRightDip = new Point(Math.Max(dip1.X, dip2.X), Math.Max(dip1.Y, dip2.Y));

        var topLeftScreen = SelectionCanvas.PointToScreen(topLeftDip);
        var bottomRightScreen = SelectionCanvas.PointToScreen(bottomRightDip);

        var x = (int)Math.Round(topLeftScreen.X);
        var y = (int)Math.Round(topLeftScreen.Y);
        var w = (int)Math.Round(bottomRightScreen.X - topLeftScreen.X);
        var h = (int)Math.Round(bottomRightScreen.Y - topLeftScreen.Y);

        return new CaptureRegion
        {
            X = x,
            Y = y,
            Width = Math.Max(0, w),
            Height = Math.Max(0, h)
        };
    }

    private void Window_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            SelectedRegion = null;
            DialogResult = false;
            Close();
        }
    }

    private void Window_MouseRightButtonDown(object sender, MouseButtonEventArgs e)
    {
        SelectedRegion = null;
        DialogResult = false;
        Close();
    }
}
