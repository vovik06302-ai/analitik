using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PearlAiAnalyst.Models;

namespace PearlAiAnalyst.Services;

public sealed class ClaudeClient
{
    private const string MessagesEndpoint = "https://api.anthropic.com/v1/messages";
    private const string ModelsEndpoint = "https://api.anthropic.com/v1/models";
    private readonly HttpClient _httpClient;
    private readonly LoggerService _logger;

    public ClaudeClient(LoggerService logger)
    {
        _logger = logger;
        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(2)
        };
    }

    public async Task<ClaudeStatus> CheckStatusAsync(string? apiKey, CancellationToken cancellationToken = default)
    {
        var loc = LocalizationService.Instance;
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new ClaudeStatus
            {
                State = ServiceConnectionState.NotConfigured,
                IsConnected = false,
                StatusMessage = loc["ClaudeNotConfigured"],
                TroubleshootingTooltip = loc["ClaudeTooltipNoKey"]
            };
        }

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(6));

            using var request = new HttpRequestMessage(HttpMethod.Get, ModelsEndpoint);
            request.Headers.Add("x-api-key", apiKey.Trim());
            request.Headers.Add("anthropic-version", "2023-06-01");

            using var response = await _httpClient.SendAsync(request, cts.Token);
            var code = (int)response.StatusCode;

            if (response.IsSuccessStatusCode)
            {
                return new ClaudeStatus
                {
                    State = ServiceConnectionState.Connected,
                    IsConnected = true,
                    StatusMessage = loc["ClaudeConnected"],
                    TroubleshootingTooltip = loc["ClaudeTooltipConnected"]
                };
            }

            if (code is 401 or 403)
            {
                return new ClaudeStatus
                {
                    State = ServiceConnectionState.Error,
                    IsConnected = false,
                    StatusMessage = string.Format(loc["ClaudeAuthError"], code),
                    TroubleshootingTooltip = loc["ClaudeTooltipAuthError"]
                };
            }

            if (code == 429)
            {
                return new ClaudeStatus
                {
                    State = ServiceConnectionState.Error,
                    IsConnected = false,
                    StatusMessage = loc["ClaudeRateLimit"],
                    TroubleshootingTooltip = loc["ClaudeTooltipRateLimit"]
                };
            }

            return new ClaudeStatus
            {
                State = ServiceConnectionState.Error,
                IsConnected = false,
                StatusMessage = string.Format(loc["ClaudeHttpError"], code),
                TroubleshootingTooltip = string.Format(loc["ClaudeTooltipHttpError"], code)
            };
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new ClaudeStatus
            {
                State = ServiceConnectionState.Error,
                IsConnected = false,
                StatusMessage = loc["ClaudeOffline"],
                TroubleshootingTooltip = loc["ClaudeTooltipTimeout"]
            };
        }
        catch (HttpRequestException ex)
        {
            return new ClaudeStatus
            {
                State = ServiceConnectionState.Error,
                IsConnected = false,
                StatusMessage = loc["ClaudeOffline"],
                TroubleshootingTooltip = string.Format(loc["ClaudeTooltipNetworkError"], ex.Message)
            };
        }
        catch (Exception ex)
        {
            _logger.Warning($"Ошибка проверки Claude API: {ex.Message}");
            return new ClaudeStatus
            {
                State = ServiceConnectionState.Error,
                IsConnected = false,
                StatusMessage = loc["ClaudeOffline"],
                TroubleshootingTooltip = string.Format(loc["ClaudeTooltipNetworkError"], ex.Message)
            };
        }
    }

    public async Task<ForecastResult> AnalyzeAsync(
        string apiKey,
        string model,
        string base64Png,
        string screenshotPath,
        IReadOnlyList<NewsItem> news,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("Не указан ключ Claude API. Введите ключ в разделе «Настройки».");

        var modelName = string.IsNullOrWhiteSpace(model) ? AppConstants.DefaultClaudeModel : model.Trim();
        var prompt = ForecastParser.BuildAnalysisPrompt(news);
        var stopwatch = Stopwatch.StartNew();

        var messages = new List<object>
        {
            new
            {
                role = "user",
                content = new object[]
                {
                    new
                    {
                        type = "image",
                        source = new
                        {
                            type = "base64",
                            media_type = "image/png",
                            data = base64Png
                        }
                    },
                    new
                    {
                        type = "text",
                        text = prompt
                    }
                }
            }
        };

        string? lastError = null;
        for (var attempt = 1; attempt <= 2; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var payload = new
            {
                model = modelName,
                max_tokens = 1500,
                temperature = 0.1,
                messages
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, MessagesEndpoint);
            request.Headers.Add("x-api-key", apiKey.Trim());
            request.Headers.Add("anthropic-version", "2023-06-01");
            request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            HttpResponseMessage response;
            try
            {
                response = await _httpClient.SendAsync(request, cancellationToken);
            }
            catch (HttpRequestException ex)
            {
                _logger.Error("Ошибка сети при обращении к Claude API.", ex);
                throw new InvalidOperationException("Не удалось подключиться к Claude API. Проверьте подключение к интернету.", ex);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                _logger.Error("Превышено время ожидания Claude API.", ex);
                throw new TimeoutException("Превышено время ожидания ответа от Claude API.", ex);
            }

            using (response)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.Error($"Claude API ошибка {(int)response.StatusCode}: {body}");
                    throw new InvalidOperationException($"Ошибка Claude API ({(int)response.StatusCode}). Проверьте ключ и выбранную модель.");
                }

                var rawText = ExtractClaudeText(body);
                var parseOutcome = ForecastParser.TryParse(rawText);
                if (parseOutcome.Success && parseOutcome.Result is not null)
                {
                    stopwatch.Stop();
                    var result = parseOutcome.Result;
                    result.ModelName = modelName;
                    result.ProviderName = "Claude API";
                    result.ResponseTimeMs = stopwatch.ElapsedMilliseconds;
                    result.ScreenshotPath = screenshotPath;
                    result.CreatedAtUtc = DateTimeOffset.UtcNow;

                    _logger.Info($"Claude API анализ успешен (попытка {attempt}, {result.ResponseTimeMs} мс, {result.Direction}, {result.Confidence}%).");
                    return result;
                }

                lastError = parseOutcome.ErrorMessage;
                _logger.Warning($"Попытка {attempt} разбора JSON от Claude API не удалась: {lastError}");

                if (attempt == 1)
                {
                    messages.Add(new { role = "assistant", content = rawText });
                    messages.Add(new { role = "user", content = ForecastParser.BuildRetryPrompt(lastError) });
                }
            }
        }

        throw new InvalidOperationException($"Не удалось разобрать ответ Claude API в JSON после повторной попытки: {lastError}");
    }

    private static string ExtractClaudeText(string responseBody)
    {
        var root = JsonNode.Parse(responseBody);
        if (root?["content"] is not JsonArray arr)
            return string.Empty;

        var sb = new StringBuilder();
        foreach (var block in arr)
        {
            if (block?["type"]?.GetValue<string>() == "text")
            {
                sb.AppendLine(block["text"]?.GetValue<string>());
            }
        }
        return sb.ToString();
    }
}
