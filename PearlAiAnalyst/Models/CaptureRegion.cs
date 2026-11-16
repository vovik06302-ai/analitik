using System.Text.Json.Serialization;

namespace PearlAiAnalyst.Models;

public sealed class CaptureRegion
{
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }

    [JsonIgnore]
    public bool IsValid => Width >= 20 && Height >= 20;

    public override string ToString() => IsValid
        ? $"{Width}×{Height} ({X}, {Y})"
        : "не задана";
}
