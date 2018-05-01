namespace Ballast.Core.Models.Interfaces
{
    public interface ITileShape : IStaticListType
    {
        bool? ApplyHexRowScaling { get; }
        bool? DoubleIncrement { get; }
        bool? HasDirectionNorth { get; }
        bool? HasDirectionSouth { get; }
        bool? HasDirectionWest { get; }
        bool? HasDirectionEast { get; }
        bool? HasDirectionNorthWest { get; }
        bool? HasDirectionNorthEast { get; }
        bool? HasDirectionSouthWest { get; }
        bool? HasDirectionSouthEast { get; }
    }
}