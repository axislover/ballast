import { Board, IBoard } from '../models/board';
import { BoardType, IBoardType } from '../models/board-type';
import { CubicCoordinates } from '../models/cubic-coordinates';
import { OffsetCoordinates } from '../models/offset-coordinates';
import { Terrain } from '../models/terrain';
import { ITile, Tile } from '../models/tile';
import { ITileShape, TileShape } from '../models/tile-shape';

export interface IBoardGenerator {
    createBoard(
        id: string,
        boardType: IBoardType,
        tileShape: ITileShape,
        columnsOrSideLength: number,
        rows?: number,
        landToWaterRatio?: number
    ): IBoard;
}

export class BoardGenerator implements IBoardGenerator {

    public createBoard(
        id: string,
        boardType: IBoardType,
        tileShape: ITileShape,
        columnsOrSideLength: number,
        rows?: number,
        landToWaterRatio?: number
    ) {

        // Determine shape and tile layout
        let useTileShape = TileShape.fromObject(tileShape);
        let useBoardType = BoardType.fromObject(boardType);

        // Validate column count
        if (columnsOrSideLength < 3) {
            throw new Error('Not enough tile column(s) were specified');
        }

        // Validate row count
        if ((rows || columnsOrSideLength) < 3) {
            throw new Error('Not enough row column(s) were specified');
        }

        // regular polygon boards enforce an odd number of column(s)
        if (useBoardType.centerOrigin && ((columnsOrSideLength & 1) < 1)) {
            throw new Error('Board types with centered origin require an odd number of column(s)');
        }

        // Array to store rows of tiles (board)
        let tiles: ITile[] = [];

        // Build Rectangular board (fixed number of tiles per row)
        if (useBoardType.equals(BoardType.Rectangle)) {
            // Calculate width and height
            let columnCount = columnsOrSideLength;
            let rowCount = rows || columnsOrSideLength;  // Default to width (length of side)
            tiles = this.buildRectangle(columnCount, rowCount, useTileShape);
        }

        // Build Regular polygon / convex shape board
        if (useBoardType.equals(BoardType.RegularPolygon)) {
            let sideLength = columnsOrSideLength;
            if (useTileShape.equals(TileShape.Square)) {
                tiles = this.buildSquare(sideLength, useBoardType.centerOrigin);
            }
            if (useTileShape.equals(TileShape.Octagon)) {
                tiles = this.buildRegularOctagon(sideLength, useBoardType.centerOrigin);
            }
            if (useTileShape.equals(TileShape.Hexagon) || useTileShape.equals(TileShape.Circle)) {
                tiles = this.buildRegularHexagon(sideLength, useBoardType.centerOrigin, useTileShape);
            }
        }

        // Get a terrain type for each tile
        let impassableTerrain = Terrain.list().filter(x => !x.passable);
        let passableTerrain = Terrain.list().filter(x => x.passable);
        for (let tile of tiles) {
            let terrain = this.getRandomTerrain(landToWaterRatio, impassableTerrain, passableTerrain)
            tile.terrain = terrain;
        }

        // Create new board 
        let board = Board.fromObject({
            boardType: useBoardType,
            id: id,
            tiles: tiles,
            tileShape: useTileShape
        });

        // return the board
        return board;

    }

    private getRandomTerrain(landToWaterRatio?: number, impassableTerrain?: Terrain[], passableTerrain?: Terrain[]): Terrain {

        // Definitively set land-to-water ratio & percentages
        landToWaterRatio = landToWaterRatio || 1;
        let impassablePercentage = landToWaterRatio / (landToWaterRatio + 1);
        let passablePercentage = 1 - impassablePercentage;

        // Get passable terrain types to use when figuring land/water tile ratio
        impassableTerrain = impassableTerrain || Terrain.list().filter(x => !x.passable);
        passableTerrain = passableTerrain || Terrain.list().filter(x => x.passable);

        // Determine if the terrain should be passable or impassable
        let terrainChoices = passableTerrain;
        let randomPercentage = Math.random();
        if (
            (passablePercentage >= impassablePercentage && passablePercentage < randomPercentage) ||
            (impassablePercentage >= randomPercentage)
        ) {
            terrainChoices = impassableTerrain;
        }

        // Return a random terrain from the chosen array
        let terrain = terrainChoices[Math.floor(Math.random() * terrainChoices.length)];
        return terrain;

    }

    private buildRectangle(columnCount: number, rowCount: number, tileShape: TileShape) {
        let rectangle: Tile[] = [];
        let increment = tileShape.doubleIncrement ? 2 : 1;
        for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
            let row = rowIndex * increment;
            for (let colIndex = 0; colIndex < columnCount; colIndex++) {
                let col = colIndex * increment;
                let cubicCoordinates = CubicCoordinates.fromOffset(
                    OffsetCoordinates.fromObject({ row: row, col: col })
                );
                rectangle.push(Tile.fromObject({
                    cubicCoordinates: cubicCoordinates,
                    tileShape: tileShape,
                    terrain: Terrain.Water
                }));
            }
        }
        return rectangle;
    }

    private buildSquare(sideLength: number, centerOrigin: boolean) {

        let square: Tile[] = [];
        let increment = TileShape.Square.doubleIncrement ? 2 : 1;
        let centerOffset = centerOrigin ? (((sideLength * increment) / 2) - 1) : 0;

        // Loop through rows x columns
        for (let rowIndex = 0; rowIndex < sideLength; rowIndex++) {
            let row = (rowIndex * increment) - centerOffset;
            for (let colIndex = 0; colIndex < sideLength; colIndex++) {
                let col = (colIndex * increment) - centerOffset;
                let cubicCoordinates = CubicCoordinates.fromOffset(
                    OffsetCoordinates.fromObject({ row: row, col: col })
                );
                square.push(Tile.fromObject({
                    cubicCoordinates: cubicCoordinates,
                    tileShape: TileShape.Square,
                    terrain: Terrain.Water
                }));
            }
        }

        // return the square tiles
        return square;

    }

    private buildRegularOctagon(sideLength: number, centerOrigin: boolean) {

        let octagon: Tile[] = [];
        let increment = TileShape.Octagon.doubleIncrement ? 2 : 1;
        let maxLength = sideLength + 2 * (sideLength - 1);
        let centerOffset = centerOrigin ? (((maxLength * increment) / 2) - 1) : 0;

        // Build top portion of octagon
        let rowLength = sideLength - 2;
        let rowIndex = -1;
        while (rowLength < (maxLength - 2)) {
            rowLength += 2;
            rowIndex++;
            let row = (rowIndex * increment) - centerOffset;
            let colOffset = (maxLength - rowLength) / 2;
            for (let colIndex = 0; colIndex < rowLength; colIndex++) {
                let col = ((colIndex + colOffset) * increment) - centerOffset;
                octagon.push(Tile.fromObject({
                    cubicCoordinates: CubicCoordinates.fromOffset(
                        OffsetCoordinates.fromObject({ row: row, col: col })
                    ),
                    tileShape: TileShape.Octagon,
                    terrain: Terrain.Water
                }));
            }
        }

        // Build middle portion of octagon
        rowIndex++;
        let middleRowCount = rowIndex + sideLength;
        for (rowIndex; rowIndex < middleRowCount; rowIndex++) {
            rowLength = maxLength;
            let row = (rowIndex * increment) - centerOffset;
            for (let colIndex = 0; colIndex < rowLength; colIndex++) {
                let col = (colIndex * increment) - centerOffset;
                octagon.push(Tile.fromObject({
                    cubicCoordinates: CubicCoordinates.fromOffset(
                        OffsetCoordinates.fromObject({ row: row, col: col })
                    ),
                    tileShape: TileShape.Octagon,
                    terrain: Terrain.Water
                }));
            }
        }

        // Build bottom portion of octagon
        rowIndex--;
        while (rowLength > sideLength) {
            rowLength -= 2;
            rowIndex++;
            let row = (rowIndex * increment) - centerOffset;
            let colOffset = (maxLength - rowLength) / 2;
            for (let colIndex = 0; colIndex < rowLength; colIndex++) {
                let col = ((colIndex + colOffset) * increment) - centerOffset;
                octagon.push(Tile.fromObject({
                    cubicCoordinates: CubicCoordinates.fromOffset(
                        OffsetCoordinates.fromObject({ row: row, col: col })
                    ),
                    tileShape: TileShape.Octagon,
                    terrain: Terrain.Water
                }));
            }
        }

        // return the octagon tiles
        return octagon;

    }

    private buildRegularHexagon(sideLength: number, centerOrigin: boolean, tileShape?: TileShape) {

        let hexagon: Tile[] = [];
        let increment = TileShape.Hexagon.doubleIncrement ? 2 : 1;
        let maxLength = (2 * sideLength) - 1;
        let centerOffset = centerOrigin ? ((sideLength * increment) - 1) : 0;
        if (typeof tileShape == 'undefined') {
            tileShape = TileShape.Hexagon;
        }

        // Build top portion of hexagon
        let rowLength = sideLength - 1;
        let rowIndex = -1;
        while (rowLength < (maxLength - 1)) {
            rowLength++;
            rowIndex++;
            let row = (rowIndex * increment) - centerOffset;
            let colOffset = Math.floor((maxLength - rowLength) / 2); // TODO:  Fix bug where column offset produces fractional value
            for (let colIndex = 0; colIndex < rowLength; colIndex++) {
                let col = ((colIndex + colOffset) * increment) - centerOffset;
                hexagon.push(Tile.fromObject({
                    cubicCoordinates: CubicCoordinates.fromOffset(
                        OffsetCoordinates.fromObject({ row: row, col: col })
                    ),
                    tileShape: tileShape,
                    terrain: Terrain.Water
                }));
            }
        }

        // Build middle row of hexagon
        rowIndex++;
        rowLength = maxLength;
        let row = (rowIndex * increment) - centerOffset;
        for (let colIndex = 0; colIndex < rowLength; colIndex++) {
            let col = (colIndex * increment) - centerOffset;
            hexagon.push(Tile.fromObject({
                cubicCoordinates: CubicCoordinates.fromOffset(
                    OffsetCoordinates.fromObject({ row: row, col: col })
                ),
                tileShape: tileShape,
                terrain: Terrain.Water
            }));
        }

        // Build bottom portion of hexagon
        while (rowLength > sideLength) {
            rowLength--;
            rowIndex++;
            let row = (rowIndex * increment) - centerOffset;
            let colOffset = Math.floor((maxLength - rowLength) / 2); // TODO:  Fix bug where column offset produces fractional value
            for (let colIndex = 0; colIndex < rowLength; colIndex++) {
                let col = ((colIndex + colOffset) * increment) - centerOffset;
                hexagon.push(Tile.fromObject({
                    cubicCoordinates: CubicCoordinates.fromOffset(
                        OffsetCoordinates.fromObject({ row: row, col: col })
                    ),
                    tileShape: tileShape,
                    terrain: Terrain.Water
                }));
            }
        }

        // return the hexagon tiles
        return hexagon;

    }

}