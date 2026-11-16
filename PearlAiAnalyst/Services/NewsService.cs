using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using PearlAiAnalyst.Models;

namespace PearlAiAnalyst.Services;

public sealed class NewsService
{
    private readonly HttpClient _httpClient;
    private readonly LoggerService _logger;

    public NewsService(LoggerService logger)
    {
        _logger = logger;
        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(15)
        };
        _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("PearlAiAnalyst/1.0 (+https://github.com/vovik06302-ai/pearl-ai-analyst)");
    }

    public async Task<List<NewsItem>> FetchNewsAsync(
        IEnumerable<string> rssFeeds,
        IEnumerable<string> keywords,
        CancellationToken cancellationToken = default)
    {
        var results = new List<NewsItem>();
        var fetchTasks = new List<Task<List<NewsItem>>>();

        foreach (var feedUrl in rssFeeds.Where(u => !string.IsNullOrWhiteSpace(u)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            fetchTasks.Add(FetchFeedSafeAsync(feedUrl.Trim(), "RSS", cancellationToken));
        }

        foreach (var keyword in keywords.Where(k => !string.IsNullOrWhiteSpace(k)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var cleanKeyword = keyword.Trim();
            var encodedQuery = Uri.EscapeDataString($"\"{cleanKeyword}\"");
            var googleNewsUrl = $"https://news.google.com/rss/search?q={encodedQuery}&hl=en-US&gl=US&ceid=US:en";
            fetchTasks.Add(FetchFeedSafeAsync(googleNewsUrl, cleanKeyword, cancellationToken));
        }

        var batches = await Task.WhenAll(fetchTasks);
        foreach (var batch in batches)
        {
            results.AddRange(batch);
        }

        var deduplicated = results
            .Where(item => !string.IsNullOrWhiteSpace(item.Title))
            .GroupBy(item => NormalizeKey(item.Link, item.Title))
            .Select(group => group.OrderByDescending(i => i.PublishedAt ?? DateTimeOffset.MinValue).First())
            .OrderByDescending(item => item.PublishedAt ?? DateTimeOffset.MinValue)
            .Take(40)
            .ToList();

        _logger.Info($"Загружено новостей: {deduplicated.Count}");
        return deduplicated;
    }

    private async Task<List<NewsItem>> FetchFeedSafeAsync(string url, string queryTag, CancellationToken cancellationToken)
    {
        try
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                _logger.Warning($"Пропущен некорректный URL ленты: {url}");
                return [];
            }

            using var response = await _httpClient.GetAsync(uri, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.Warning($"RSS вернул статус {(int)response.StatusCode}: {url}");
                return [];
            }

            var xmlContent = await response.Content.ReadAsStringAsync(cancellationToken);
            return ParseRssOrAtom(xmlContent, uri.Host, queryTag);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.Warning($"Ошибка загрузки новостей из {url}: {ex.Message}");
            return [];
        }
    }

    private static List<NewsItem> ParseRssOrAtom(string xmlContent, string fallbackHost, string queryTag)
    {
        var items = new List<NewsItem>();
        var doc = XDocument.Parse(xmlContent, LoadOptions.None);
        var root = doc.Root;
        if (root is null)
            return items;

        // RSS 2.0
        var channelTitle = root.Element("channel")?.Element("title")?.Value?.Trim();
        foreach (var itemEl in doc.Descendants().Where(e => e.Name.LocalName == "item"))
        {
            var title = CleanText(itemEl.Elements().FirstOrDefault(e => e.Name.LocalName == "title")?.Value);
            var link = itemEl.Elements().FirstOrDefault(e => e.Name.LocalName == "link")?.Value?.Trim() ?? string.Empty;
            var source = CleanText(itemEl.Elements().FirstOrDefault(e => e.Name.LocalName == "source")?.Value);
            var pubDateRaw = itemEl.Elements().FirstOrDefault(e => e.Name.LocalName == "pubDate")?.Value
                             ?? itemEl.Elements().FirstOrDefault(e => e.Name.LocalName == "date")?.Value;

            if (string.IsNullOrWhiteSpace(title))
                continue;

            // Google News appends " - Source Name" to titles when <source> is also present
            if (!string.IsNullOrWhiteSpace(source) && title.EndsWith($" - {source}", StringComparison.OrdinalIgnoreCase))
            {
                title = title[..^(source.Length + 3)].Trim();
            }

            items.Add(new NewsItem
            {
                Title = title,
                Link = link,
                Source = !string.IsNullOrWhiteSpace(source) ? source : (!string.IsNullOrWhiteSpace(channelTitle) ? channelTitle : fallbackHost),
                PublishedAt = TryParseDate(pubDateRaw),
                MatchedQuery = queryTag
            });
        }

        if (items.Count > 0)
            return items;

        // Atom feed
        var atomFeedTitle = CleanText(root.Elements().FirstOrDefault(e => e.Name.LocalName == "title")?.Value);
        foreach (var entryEl in doc.Descendants().Where(e => e.Name.LocalName == "entry"))
        {
            var title = CleanText(entryEl.Elements().FirstOrDefault(e => e.Name.LocalName == "title")?.Value);
            var linkEl = entryEl.Elements().FirstOrDefault(e => e.Name.LocalName == "link" &&
                (e.Attribute("rel")?.Value is null or "alternate"));
            var link = linkEl?.Attribute("href")?.Value?.Trim() ?? string.Empty;
            var dateRaw = entryEl.Elements().FirstOrDefault(e => e.Name.LocalName == "published")?.Value
                          ?? entryEl.Elements().FirstOrDefault(e => e.Name.LocalName == "updated")?.Value;

            if (string.IsNullOrWhiteSpace(title))
                continue;

            items.Add(new NewsItem
            {
                Title = title,
                Link = link,
                Source = !string.IsNullOrWhiteSpace(atomFeedTitle) ? atomFeedTitle : fallbackHost,
                PublishedAt = TryParseDate(dateRaw),
                MatchedQuery = queryTag
            });
        }

        return items;
    }

    private static DateTimeOffset? TryParseDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        if (DateTimeOffset.TryParse(raw.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var parsed))
            return parsed;

        return null;
    }

    private static string CleanText(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return string.Empty;

        var decoded = WebUtility.HtmlDecode(input);
        var withoutTags = Regex.Replace(decoded, "<.*?>", " ");
        return Regex.Replace(withoutTags, @"\s+", " ").Trim();
    }

    private static string NormalizeKey(string link, string title)
    {
        if (!string.IsNullOrWhiteSpace(link))
            return link.Trim().ToLowerInvariant();
        return title.Trim().ToLowerInvariant();
    }
}
