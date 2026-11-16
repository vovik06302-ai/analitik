using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PearlAiAnalyst.Models;

namespace PearlAiAnalyst.Services;

public sealed class ForecastParseOutcome
{
    public bool Success { get; init; }
    public ForecastResult? Result { get; init; }
    public string ErrorMessage { get; init; } = string.Empty;

    public static ForecastParseOutcome Ok(ForecastResult result) => new() { Success = true, Result = result };
    public static ForecastParseOutcome Fail(string error) => new() { Success = false, ErrorMessage = error };
}

public static class ForecastParser
{
    public static string BuildAnalysisPrompt(IReadOnlyList<NewsItem> news)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Ты — технический и новостной аналитик криптовалютного рынка.");
        sb.AppendLine("На прикреплённом скриншоте показан график пары PEARL/USDT на бирже SafeTrade.");
        sb.AppendLine("Твоя задача: проанализировать свечи, тренд, объёмы, уровни на графике и приведённые ниже реальные новости, и вернуть строго валидный JSON без пояснений вне JSON.");
        sb.AppendLine();
        sb.AppendLine("КРИТИЧЕСКИ ВАЖНОЕ ПРАВИЛО:");
        sb.AppendLine("Если цифры на шкале цен на скриншоте не читаются, обрезаны или неясны — обязательно пиши null для числовых полей (price_now, target_price, stop_price) и пустой массив [] для support/resistance. НИКОГДА не выдумывай и не угадывай числа!");
        sb.AppendLine();
        sb.AppendLine("Свежие новости:");
        if (news.Count == 0)
        {
            sb.AppendLine("- Новостей по ключевым словам не найдено.");
        }
        else
        {
            foreach (var item in news.Take(12))
            {
                sb.AppendLine($"- [{item.FormattedDate}] ({item.Source}) {item.Title}");
            }
        }

        sb.AppendLine();
        sb.AppendLine("Верни ТОЛЬКО JSON со следующей точной структурой:");
        sb.AppendLine("""
        {
          "price_now": number | null,
          "direction": "up" | "down" | "sideways",
          "confidence": integer (0..100),
          "support": [number],
          "resistance": [number],
          "target_price": number | null,
          "stop_price": number | null,
          "chart_reasons": ["строка причины по графику"],
          "news_impact": "краткое описание влияния новостей",
          "news_reasons": ["новостной фактор"],
          "risks": ["основной риск"]
        }
        """);
        sb.AppendLine("Отвечай на русском языке внутри текстовых полей.");
        return sb.ToString();
    }

    public static string BuildRetryPrompt(string parseError)
    {
        return $"Твой предыдущий ответ не удалось разобрать как корректный JSON ({parseError}). " +
               "Верни ТОЛЬКО один валидный JSON-объект без markdown-блоков и лишнего текста со схемой: " +
               "{\"price_now\": number|null, \"direction\": \"up\"|\"down\"|\"sideways\", \"confidence\": 0..100, " +
               "\"support\": [], \"resistance\": [], \"target_price\": number|null, \"stop_price\": number|null, " +
               "\"chart_reasons\": [], \"news_impact\": \"\", \"news_reasons\": [], \"risks\": []}.";
    }

    public static ForecastParseOutcome TryParse(string rawResponse)
    {
        if (string.IsNullOrWhiteSpace(rawResponse))
            return ForecastParseOutcome.Fail("Пустой ответ от модели.");

        var jsonText = ExtractJsonObject(rawResponse);
        if (string.IsNullOrWhiteSpace(jsonText))
            return ForecastParseOutcome.Fail("В ответе модели не найден JSON-объект.");

        try
        {
            var node = JsonNode.Parse(jsonText);
            if (node is not JsonObject obj)
                return ForecastParseOutcome.Fail("Корневой элемент ответа не является JSON-объектом.");

            var directionRaw = GetString(obj, "direction")?.Trim().ToLowerInvariant();
            var direction = directionRaw switch
            {
                "up" or "bullish" or "long" => ForecastDirection.Up,
                "down" or "bearish" or "short" => ForecastDirection.Down,
                "sideways" or "flat" or "neutral" or "range" => ForecastDirection.Sideways,
                _ => ForecastDirection.Unknown
            };

            if (direction == ForecastDirection.Unknown)
                return ForecastParseOutcome.Fail($"Некорректное значение direction: '{directionRaw ?? "null"}'.");

            var confidenceDouble = GetNullableDouble(obj, "confidence");
            if (!confidenceDouble.HasValue)
                return ForecastParseOutcome.Fail("Отсутствует числовое поле confidence.");

            var confidence = (int)Math.Clamp(Math.Round(confidenceDouble.Value), 0, 100);

            var result = new ForecastResult
            {
                PriceNow = GetNullableDouble(obj, "price_now"),
                Direction = direction,
                Confidence = confidence,
                Support = GetDoubleList(obj, "support"),
                Resistance = GetDoubleList(obj, "resistance"),
                TargetPrice = GetNullableDouble(obj, "target_price"),
                StopPrice = GetNullableDouble(obj, "stop_price"),
                ChartReasons = GetStringList(obj, "chart_reasons"),
                NewsImpact = GetString(obj, "news_impact") ?? string.Empty,
                NewsReasons = GetStringList(obj, "news_reasons"),
                Risks = GetStringList(obj, "risks"),
                RawJson = jsonText
            };

            return ForecastParseOutcome.Ok(result);
        }
        catch (JsonException ex)
        {
            return ForecastParseOutcome.Fail($"Синтаксическая ошибка JSON: {ex.Message}");
        }
        catch (Exception ex)
        {
            return ForecastParseOutcome.Fail($"Ошибка разбора JSON: {ex.Message}");
        }
    }

    private static string? ExtractJsonObject(string raw)
    {
        var trimmed = raw.Trim();
        if (trimmed.StartsWith("```"))
        {
            var firstNewline = trimmed.IndexOf('\n');
            if (firstNewline >= 0)
                trimmed = trimmed[(firstNewline + 1)..];
            var lastFence = trimmed.LastIndexOf("```", StringComparison.Ordinal);
            if (lastFence >= 0)
                trimmed = trimmed[..lastFence];
            trimmed = trimmed.Trim();
        }

        var start = trimmed.IndexOf('{');
        if (start < 0)
            return null;

        var depth = 0;
        var inString = false;
        var escaped = false;

        for (var i = start; i < trimmed.Length; i++)
        {
            var ch = trimmed[i];
            if (escaped)
            {
                escaped = false;
                continue;
            }

            if (ch == '\\' && inString)
            {
                escaped = true;
                continue;
            }

            if (ch == '"')
            {
                inString = !inString;
                continue;
            }

            if (inString)
                continue;

            if (ch == '{')
                depth++;
            else if (ch == '}')
            {
                depth--;
                if (depth == 0)
                    return trimmed[start..(i + 1)];
            }
        }

        return null;
    }

    private static string? GetString(JsonObject obj, string propertyName)
    {
        if (!TryGetPropertyCaseInsensitive(obj, propertyName, out var node) || node is null)
            return null;

        if (node is JsonValue val)
        {
            if (val.TryGetValue<string>(out var s))
                return s;
            return val.ToJsonString();
        }

        return node.ToJsonString();
    }

    private static double? GetNullableDouble(JsonObject obj, string propertyName)
    {
        if (!TryGetPropertyCaseInsensitive(obj, propertyName, out var node) || node is null)
            return null;

        return ParseDoubleNode(node);
    }

    private static double? ParseDoubleNode(JsonNode? node)
    {
        if (node is null)
            return null;

        if (node is JsonValue val)
        {
            if (val.TryGetValue<double>(out var d) && double.IsFinite(d))
                return d;
            if (val.TryGetValue<decimal>(out var dec))
                return (double)dec;
            if (val.TryGetValue<int>(out var i))
                return i;
            if (val.TryGetValue<string>(out var str))
            {
                str = str.Trim().Replace("$", "").Replace(",", ".");
                if (string.IsNullOrEmpty(str) || str.Equals("null", StringComparison.OrdinalIgnoreCase))
                    return null;
                if (double.TryParse(str, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) && double.IsFinite(parsed))
                    return parsed;
            }
        }

        return null;
    }

    private static List<double> GetDoubleList(JsonObject obj, string propertyName)
    {
        var list = new List<double>();
        if (!TryGetPropertyCaseInsensitive(obj, propertyName, out var node) || node is null)
            return list;

        if (node is JsonArray arr)
        {
            foreach (var item in arr)
            {
                var parsed = ParseDoubleNode(item);
                if (parsed.HasValue)
                    list.Add(parsed.Value);
            }
        }
        else
        {
            var single = ParseDoubleNode(node);
            if (single.HasValue)
                list.Add(single.Value);
        }

        return list;
    }

    private static List<string> GetStringList(JsonObject obj, string propertyName)
    {
        var list = new List<string>();
        if (!TryGetPropertyCaseInsensitive(obj, propertyName, out var node) || node is null)
            return list;

        if (node is JsonArray arr)
        {
            foreach (var item in arr)
            {
                var text = item?.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(text) && !text.Equals("null", StringComparison.OrdinalIgnoreCase))
                    list.Add(text);
            }
        }
        else
        {
            var text = node.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(text) && !text.Equals("null", StringComparison.OrdinalIgnoreCase))
                list.Add(text);
        }

        return list;
    }

    private static bool TryGetPropertyCaseInsensitive(JsonObject obj, string name, out JsonNode? value)
    {
        foreach (var kvp in obj)
        {
            if (string.Equals(kvp.Key, name, StringComparison.OrdinalIgnoreCase))
            {
                value = kvp.Value;
                return true;
            }
        }

        value = null;
        return false;
    }
}
