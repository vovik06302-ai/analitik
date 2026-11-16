using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PearlAiAnalyst.Models;

namespace PearlAiAnalyst.Services;

public sealed class OllamaClient
{
    private readonly HttpClient _httpClient;
    private readonly LoggerService _logger;

    public OllamaClient(LoggerService logger)
    {
        _logger = logger;
        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(6)
        };
    }

    public async Task<OllamaStatus> CheckStatusAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        var normalizedBase = NormalizeBaseUrl(baseUrl);
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(5));

            using var response = await _httpClient.GetAsync($"{normalizedBase}/api/tags", cts.Token);
            if (!response.IsSuccessStatusCode)
            {
                return new OllamaStatus
                {
                    IsRunning = false,
                    StatusMessage = $"Ollama ответил с ошибкой ({(int)response.StatusCode})",
                    HintMessage = LocalizationService.Instance["OllamaOfflineHint"]
                };
            }

            var json = await response.Content.ReadAsStringAsync(cts.Token);
            var root = JsonNode.Parse(json);
            var models = new List<string>();

            if (root?["models"] is JsonArray arr)
            {
                foreach (var item in arr)
                {
                    var name = item?["name"]?.GetValue<string>();
                    if (!string.IsNullOrWhiteSpace(name))
                        models.Add(name);
                }
            }

            return new OllamaStatus
            {
                IsRunning = true,
                StatusMessage = models.Count > 0
                    ? $"Ollama запущен • моделей: {models.Count}"
                    : "Ollama запущен • модели не установлены",
                HintMessage = models.Count == 0
                    ? "Установите модель с поддержкой изображений: ollama pull qwen2.5vl:32b (или qwen2.5vl:7b)"
                    : string.Empty,
                InstalledModels = models
            };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new OllamaStatus
            {
                IsRunning = false,
                StatusMessage = LocalizationService.Instance["OllamaOffline"],
                HintMessage = LocalizationService.Instance["OllamaOfflineHint"]
            };
        }
        catch (Exception ex)
        {
            _logger.Warning($"Ошибка проверки Ollama: {ex.Message}");
            return new OllamaStatus
            {
                IsRunning = false,
                StatusMessage = LocalizationService.Instance["OllamaOffline"],
                HintMessage = LocalizationService.Instance["OllamaOfflineHint"]
            };
        }
    }

    public async Task<ForecastResult> AnalyzeAsync(
        string baseUrl,
        string model,
        string base64Png,
        string screenshotPath,
        IReadOnlyList<NewsItem> news,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(model))
            throw new InvalidOperationException("Не выбрана модель Ollama.");

        var normalizedBase = NormalizeBaseUrl(baseUrl);
        var prompt = ForecastParser.BuildAnalysisPrompt(news);
        var stopwatch = Stopwatch.StartNew();

        var messages = new List<object>
        {
            new
            {
                role = "user",
                content = prompt,
                images = new[] { base64Png }
            }
        };

        string? lastError = null;
        for (var attempt = 1; attempt <= 2; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var payload = new
            {
                model,
                stream = false,
                format = "json",
                options = new
                {
                    temperature = 0.1
                },
                messages
            };

            var requestJson = JsonSerializer.Serialize(payload);
            using var content = new StringContent(requestJson, Encoding.UTF8, "application/json");

            HttpResponseMessage response;
            try
            {
                response = await _httpClient.PostAsync($"{normalizedBase}/api/chat", content, cancellationToken);
            }
            catch (HttpRequestException ex)
            {
                _logger.Error("Не удалось подключиться к Ollama.", ex);
                throw new InvalidOperationException(
                    "Не удалось подключиться к Ollama. Убедитесь, что сервер Ollama запущен (ollama serve).", ex);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                _logger.Error("Превышено время ожидания ответа от Ollama.", ex);
                throw new TimeoutException(
                    "Превышено время ожидания ответа от Ollama. Попробуйте более лёгкую модель (например, qwen2.5vl:7b).", ex);
            }

            using (response)
            {
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.Error($"Ollama /api/chat ошибка {(int)response.StatusCode}: {responseBody}");
                    throw new InvalidOperationException(
                        $"Ollama вернул ошибку ({(int)response.StatusCode}). Проверьте, установлена ли модель '{model}'.");
                }

                var rawModelOutput = ExtractOllamaContent(responseBody);
                var parseOutcome = ForecastParser.TryParse(rawModelOutput);
                if (parseOutcome.Success && parseOutcome.Result is not null)
                {
                    stopwatch.Stop();
                    var result = parseOutcome.Result;
                    result.ModelName = model;
                    result.ProviderName = "Ollama";
                    result.ResponseTimeMs = stopwatch.ElapsedMilliseconds;
                    result.ScreenshotPath = screenshotPath;
                    result.CreatedAtUtc = DateTimeOffset.UtcNow;

                    _logger.Info($"Ollama анализ успешен (попытка {attempt}, {result.ResponseTimeMs} мс, {result.Direction}, {result.Confidence}%).");
                    return result;
                }

                lastError = parseOutcome.ErrorMessage;
                _logger.Warning($"Попытка {attempt} разбора JSON от Ollama не удалась: {lastError}");

                if (attempt == 1)
                {
                    messages.Add(new { role = "assistant", content = rawModelOutput });
                    messages.Add(new { role = "user", content = ForecastParser.BuildRetryPrompt(lastError) });
                }
            }
        }

        throw new InvalidOperationException($"Не удалось разобрать ответ модели Ollama в JSON после повторной попытки: {lastError}");
    }

    private static string ExtractOllamaContent(string responseBody)
    {
        var root = JsonNode.Parse(responseBody);
        return root?["message"]?["content"]?.GetValue<string>() ?? string.Empty;
    }

    private static string NormalizeBaseUrl(string url)
    {
        var trimmed = string.IsNullOrWhiteSpace(url) ? AppConstants.DefaultOllamaUrl : url.Trim();
        return trimmed.TrimEnd('/');
    }
}
