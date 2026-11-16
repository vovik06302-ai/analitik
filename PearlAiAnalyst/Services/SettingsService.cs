using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Win32;
using PearlAiAnalyst.Models;

namespace PearlAiAnalyst.Services;

public sealed class SettingsService
{
    private const string RegistryRunPath = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    private readonly LoggerService _logger;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public SettingsService(LoggerService logger)
    {
        _logger = logger;
        Directory.CreateDirectory(AppConstants.AppDataDirectory);
    }

    public AppSettings Load()
    {
        try
        {
            if (!File.Exists(AppConstants.SettingsFilePath))
            {
                var defaults = new AppSettings();
                Save(defaults);
                return defaults;
            }

            var json = File.ReadAllText(AppConstants.SettingsFilePath, Encoding.UTF8);
            var settings = JsonSerializer.Deserialize<AppSettings>(json, _jsonOptions) ?? new AppSettings();

            if (settings.NewsKeywords is null || settings.NewsKeywords.Count == 0)
                settings.NewsKeywords = [.. AppConstants.DefaultNewsKeywords];

            settings.RssFeeds ??= [];
            settings.CaptureRegion ??= new CaptureRegion();

            if (settings.AutoIntervalMinutes < 1)
                settings.AutoIntervalMinutes = 15;

            if (string.IsNullOrWhiteSpace(settings.OllamaUrl))
                settings.OllamaUrl = AppConstants.DefaultOllamaUrl;

            if (string.IsNullOrWhiteSpace(settings.OllamaModel))
                settings.OllamaModel = AppConstants.DefaultOllamaModel;

            if (string.IsNullOrWhiteSpace(settings.ClaudeModel))
                settings.ClaudeModel = AppConstants.DefaultClaudeModel;

            return settings;
        }
        catch (Exception ex)
        {
            _logger.Error("Не удалось загрузить settings.json, используются настройки по умолчанию.", ex);
            return new AppSettings();
        }
    }

    public void Save(AppSettings settings)
    {
        try
        {
            Directory.CreateDirectory(AppConstants.AppDataDirectory);
            var json = JsonSerializer.Serialize(settings, _jsonOptions);
            File.WriteAllText(AppConstants.SettingsFilePath, json, Encoding.UTF8);
            ApplyAutoStart(settings.AutoStartWithWindows);
        }
        catch (Exception ex)
        {
            _logger.Error("Не удалось сохранить настройки.", ex);
            throw new InvalidOperationException($"Не удалось сохранить настройки: {ex.Message}", ex);
        }
    }

    public void SaveClaudeApiKey(string? apiKey)
    {
        try
        {
            Directory.CreateDirectory(AppConstants.AppDataDirectory);
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                if (File.Exists(AppConstants.SecretsFilePath))
                    File.Delete(AppConstants.SecretsFilePath);
                return;
            }

            var plainBytes = Encoding.UTF8.GetBytes(apiKey.Trim());
            var encryptedBytes = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(AppConstants.SecretsFilePath, encryptedBytes);
        }
        catch (Exception ex)
        {
            _logger.Error("Не удалось зашифровать ключ Claude API через DPAPI.", ex);
            throw new InvalidOperationException($"Ошибка шифрования ключа Claude API: {ex.Message}", ex);
        }
    }

    public string LoadClaudeApiKey()
    {
        try
        {
            if (!File.Exists(AppConstants.SecretsFilePath))
                return string.Empty;

            var encryptedBytes = File.ReadAllBytes(AppConstants.SecretsFilePath);
            var plainBytes = ProtectedData.Unprotect(encryptedBytes, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plainBytes);
        }
        catch (Exception ex)
        {
            _logger.Error("Не удалось расшифровать ключ Claude API.", ex);
            return string.Empty;
        }
    }

    public bool IsAutoStartEnabledInRegistry()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegistryRunPath, false);
            return key?.GetValue(AppConstants.AppId) is string value && !string.IsNullOrWhiteSpace(value);
        }
        catch
        {
            return false;
        }
    }

    private void ApplyAutoStart(bool enable)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegistryRunPath, true);
            if (key is null)
                return;

            if (enable)
            {
                var exePath = Environment.ProcessPath;
                if (!string.IsNullOrWhiteSpace(exePath))
                {
                    key.SetValue(AppConstants.AppId, $"\"{exePath}\"");
                }
            }
            else
            {
                if (key.GetValue(AppConstants.AppId) is not null)
                    key.DeleteValue(AppConstants.AppId, false);
            }
        }
        catch (Exception ex)
        {
            _logger.Error("Ошибка изменения параметра автозапуска в реестре Windows.", ex);
        }
    }
}
