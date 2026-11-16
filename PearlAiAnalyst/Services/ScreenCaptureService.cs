using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using PearlAiAnalyst.Models;

namespace PearlAiAnalyst.Services;

public sealed class ScreenCaptureService
{
    private const int SmXVirtualScreen = 76;
    private const int SmYVirtualScreen = 77;
    private const int SmCxVirtualScreen = 78;
    private const int SmCyVirtualScreen = 79;

    private readonly LoggerService _logger;

    public ScreenCaptureService(LoggerService logger)
    {
        _logger = logger;
        Directory.CreateDirectory(AppConstants.ShotsDirectory);
    }

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    public static Rectangle GetVirtualScreenPhysicalBounds()
    {
        var x = GetSystemMetrics(SmXVirtualScreen);
        var y = GetSystemMetrics(SmYVirtualScreen);
        var width = GetSystemMetrics(SmCxVirtualScreen);
        var height = GetSystemMetrics(SmCyVirtualScreen);
        return new Rectangle(x, y, width, height);
    }

    public Task<(string FilePath, string Base64Png)> CaptureRegionAsync(CaptureRegion region, CancellationToken cancellationToken = default)
    {
        if (region is null || !region.IsValid)
            throw new InvalidOperationException("Область скриншота не выбрана. Нажмите «Выбрать область» и выделите график.");

        return Task.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();

            var virtualBounds = GetVirtualScreenPhysicalBounds();
            var targetRect = new Rectangle(region.X, region.Y, region.Width, region.Height);
            var clampedRect = Rectangle.Intersect(virtualBounds, targetRect);

            if (clampedRect.Width < 10 || clampedRect.Height < 10)
            {
                throw new InvalidOperationException(
                    "Выбранная область находится за пределами текущих мониторов. Выберите область заново.");
            }

            Directory.CreateDirectory(AppConstants.ShotsDirectory);
            var fileName = $"shot_{DateTime.Now:yyyyMMdd_HHmmss}.png";
            var filePath = Path.Combine(AppConstants.ShotsDirectory, fileName);

            using var bitmap = new Bitmap(clampedRect.Width, clampedRect.Height, PixelFormat.Format32bppArgb);
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.CopyFromScreen(
                    clampedRect.X,
                    clampedRect.Y,
                    0,
                    0,
                    clampedRect.Size,
                    CopyPixelOperation.SourceCopy);
            }

            bitmap.Save(filePath, ImageFormat.Png);

            using var memoryStream = new MemoryStream();
            bitmap.Save(memoryStream, ImageFormat.Png);
            var base64 = Convert.ToBase64String(memoryStream.ToArray());

            _logger.Info($"Снимок экрана сохранён: {filePath} ({clampedRect.Width}x{clampedRect.Height})");
            return (filePath, base64);
        }, cancellationToken);
    }

    public string? GetLatestScreenshotPath()
    {
        try
        {
            if (!Directory.Exists(AppConstants.ShotsDirectory))
                return null;

            return Directory.GetFiles(AppConstants.ShotsDirectory, "*.png")
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .FirstOrDefault();
        }
        catch (Exception ex)
        {
            _logger.Error("Не удалось найти последний скриншот.", ex);
            return null;
        }
    }
}
