using Ballast.Core.Models.Interfaces;

namespace Ballast.Core.Models
{
    public class AxialCoordinates : IAxialCoordinates
    {
        public int X { get; private set; }
        public int Z { get; private set; }
    }
}