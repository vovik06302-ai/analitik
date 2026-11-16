using System.Globalization;
using System.IO;
using System.Text;
using Microsoft.Data.Sqlite;
using PearlAiAnalyst.Models;

namespace PearlAiAnalyst.Services;

public sealed class HistoryRepository
{
    private const int MinimumSamplesForAccuracy = 3;
    private readonly LoggerService _logger;
    private readonly string _connectionString;

    public HistoryRepository(LoggerService logger)
    {
        _logger = logger;
        Directory.CreateDirectory(AppConstants.AppDataDirectory);
        _connectionString = $"Data Source={AppConstants.DatabaseFilePath}";
        InitializeDatabase();
    }

    private void InitializeDatabase()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS forecasts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at_utc TEXT NOT NULL,
                price_now REAL NULL,
                direction TEXT NOT NULL,
                confidence INTEGER NOT NULL,
                target_price REAL NULL,
                stop_price REAL NULL,
                support_text TEXT NOT NULL,
                resistance_text TEXT NOT NULL,
                chart_reasons TEXT NOT NULL,
                news_impact TEXT NOT NULL,
                news_reasons TEXT NOT NULL,
                risks TEXT NOT NULL,
                model_name TEXT NOT NULL,
                provider_name TEXT NOT NULL,
                response_time_ms INTEGER NOT NULL,
                screenshot_path TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_forecasts_created ON forecasts(created_at_utc);
            """;
        command.ExecuteNonQuery();
    }

    public async Task SaveForecastAsync(ForecastResult result, CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO forecasts (
                created_at_utc, price_now, direction, confidence, target_price, stop_price,
                support_text, resistance_text, chart_reasons, news_impact, news_reasons,
                risks, model_name, provider_name, response_time_ms, screenshot_path
            ) VALUES (
                $created_at_utc, $price_now, $direction, $confidence, $target_price, $stop_price,
                $support_text, $resistance_text, $chart_reasons, $news_impact, $news_reasons,
                $risks, $model_name, $provider_name, $response_time_ms, $screenshot_path
            );
            """;

        command.Parameters.AddWithValue("$created_at_utc", result.CreatedAtUtc.UtcDateTime.ToString("O"));
        command.Parameters.AddWithValue("$price_now", result.PriceNow.HasValue ? result.PriceNow.Value : DBNull.Value);
        command.Parameters.AddWithValue("$direction", result.Direction.ToString());
        command.Parameters.AddWithValue("$confidence", result.Confidence);
        command.Parameters.AddWithValue("$target_price", result.TargetPrice.HasValue ? result.TargetPrice.Value : DBNull.Value);
        command.Parameters.AddWithValue("$stop_price", result.StopPrice.HasValue ? result.StopPrice.Value : DBNull.Value);
        command.Parameters.AddWithValue("$support_text", string.Join("; ", result.Support.Select(v => v.ToString("G", CultureInfo.InvariantCulture))));
        command.Parameters.AddWithValue("$resistance_text", string.Join("; ", result.Resistance.Select(v => v.ToString("G", CultureInfo.InvariantCulture))));
        command.Parameters.AddWithValue("$chart_reasons", string.Join(" | ", result.ChartReasons));
        command.Parameters.AddWithValue("$news_impact", result.NewsImpact);
        command.Parameters.AddWithValue("$news_reasons", string.Join(" | ", result.NewsReasons));
        command.Parameters.AddWithValue("$risks", string.Join(" | ", result.Risks));
        command.Parameters.AddWithValue("$model_name", result.ModelName);
        command.Parameters.AddWithValue("$provider_name", result.ProviderName);
        command.Parameters.AddWithValue("$response_time_ms", result.ResponseTimeMs);
        command.Parameters.AddWithValue("$screenshot_path", result.ScreenshotPath);

        await command.ExecuteNonQueryAsync(cancellationToken);
        _logger.Info($"Прогноз сохранён в SQLite ({result.Direction}, {result.Confidence}%).");
    }

    public async Task<List<ForecastHistoryEntry>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var entries = new List<ForecastHistoryEntry>();

        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, created_at_utc, price_now, direction, confidence, target_price, stop_price,
                   support_text, resistance_text, chart_reasons, news_impact, news_reasons,
                   risks, model_name, provider_name, response_time_ms, screenshot_path
            FROM forecasts
            ORDER BY datetime(created_at_utc) DESC;
            """;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var createdRaw = reader.GetString(1);
            var created = DateTimeOffset.TryParse(createdRaw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt)
                ? dt
                : DateTimeOffset.UtcNow;

            var dirRaw = reader.GetString(3);
            var direction = Enum.TryParse<ForecastDirection>(dirRaw, true, out var parsedDir)
                ? parsedDir
                : ForecastDirection.Unknown;

            entries.Add(new ForecastHistoryEntry
            {
                Id = reader.GetInt64(0),
                CreatedAtUtc = created,
                PriceNow = reader.IsDBNull(2) ? null : reader.GetDouble(2),
                Direction = direction,
                Confidence = reader.GetInt32(4),
                TargetPrice = reader.IsDBNull(5) ? null : reader.GetDouble(5),
                StopPrice = reader.IsDBNull(6) ? null : reader.GetDouble(6),
                SupportText = reader.GetString(7),
                ResistanceText = reader.GetString(8),
                ChartReasons = reader.GetString(9),
                NewsImpact = reader.GetString(10),
                NewsReasons = reader.GetString(11),
                Risks = reader.GetString(12),
                ModelName = reader.GetString(13),
                ProviderName = reader.GetString(14),
                ResponseTimeMs = reader.GetInt64(15),
                ScreenshotPath = reader.GetString(16)
            });
        }

        return entries;
    }

    public AccuracyMetrics CalculateAccuracy(IReadOnlyList<ForecastHistoryEntry> entries)
    {
        var chronological = entries
            .Where(e => e.PriceNow.HasValue && e.PriceNow.Value > 0 && e.Direction != ForecastDirection.Unknown)
            .OrderBy(e => e.CreatedAtUtc)
            .ToList();

        return new AccuracyMetrics
        {
            OneHour = EvaluateHorizon(chronological, 1, TimeSpan.FromMinutes(30)),
            TwoHours = EvaluateHorizon(chronological, 2, TimeSpan.FromMinutes(45)),
            FourHours = EvaluateHorizon(chronological, 4, TimeSpan.FromMinutes(60))
        };
    }

    private static HorizonAccuracy EvaluateHorizon(
        IReadOnlyList<ForecastHistoryEntry> chronological,
        int hours,
        TimeSpan tolerance)
    {
        var horizon = TimeSpan.FromHours(hours);
        var evaluable = 0;
        var correct = 0;

        for (var i = 0; i < chronological.Count; i++)
        {
            var current = chronological[i];
            var targetTime = current.CreatedAtUtc + horizon;

            ForecastHistoryEntry? bestMatch = null;
            var bestDiff = TimeSpan.MaxValue;

            for (var j = i + 1; j < chronological.Count; j++)
            {
                var candidate = chronological[j];
                var diff = (candidate.CreatedAtUtc - targetTime).Duration();
                if (diff <= tolerance && diff < bestDiff)
                {
                    bestDiff = diff;
                    bestMatch = candidate;
                }
            }

            if (bestMatch?.PriceNow is null || current.PriceNow is null)
                continue;

            evaluable++;
            var startPrice = current.PriceNow.Value;
            var endPrice = bestMatch.PriceNow.Value;
            var relChange = (endPrice - startPrice) / startPrice;

            var isCorrect = current.Direction switch
            {
                ForecastDirection.Up => endPrice > startPrice,
                ForecastDirection.Down => endPrice < startPrice,
                ForecastDirection.Sideways => Math.Abs(relChange) <= 0.005,
                _ => false
            };

            if (isCorrect)
                correct++;
        }

        var sufficient = evaluable >= MinimumSamplesForAccuracy;
        return new HorizonAccuracy
        {
            Hours = hours,
            EvaluableCount = evaluable,
            CorrectCount = correct,
            HasSufficientData = sufficient,
            AccuracyPercent = sufficient ? Math.Round(correct * 100.0 / evaluable, 1) : null
        };
    }

    public async Task ExportCsvAsync(string filePath, IReadOnlyList<ForecastHistoryEntry> entries, CancellationToken cancellationToken = default)
    {
        var sb = new StringBuilder();
        sb.AppendLine("ID;Время (локальное);Цена;Направление;Уверенность (%);Цель;Стоп;Поддержка;Сопротивление;Провайдер;Модель;Время ответа (мс);Причины по графику;Влияние новостей;Риски");

        foreach (var e in entries)
        {
            var row = new[]
            {
                e.Id.ToString(CultureInfo.InvariantCulture),
                e.FormattedLocalTime,
                e.PriceNow?.ToString("G", CultureInfo.InvariantCulture) ?? "нет данных",
                e.Direction.ToString(),
                e.Confidence.ToString(CultureInfo.InvariantCulture),
                e.TargetPrice?.ToString("G", CultureInfo.InvariantCulture) ?? "нет данных",
                e.StopPrice?.ToString("G", CultureInfo.InvariantCulture) ?? "нет данных",
                e.SupportText,
                e.ResistanceText,
                e.ProviderName,
                e.ModelName,
                e.ResponseTimeMs.ToString(CultureInfo.InvariantCulture),
                e.ChartReasons,
                e.NewsImpact,
                e.Risks
            };

            sb.AppendLine(string.Join(";", row.Select(EscapeCsv)));
        }

        var utf8WithBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
        await File.WriteAllTextAsync(filePath, sb.ToString(), utf8WithBom, cancellationToken);
        _logger.Info($"История экспортирована в CSV: {filePath}");
    }

    private static string EscapeCsv(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return "\"\"";

        var escaped = value.Replace("\"", "\"\"").Replace("\r", " ").Replace("\n", " ");
        return $"\"{escaped}\"";
    }
}
