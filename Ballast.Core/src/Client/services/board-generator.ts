import { IBoard, Board } from '../models/board';
import { IBoardType, BoardType } from '../models/board-type';
import { ITile, Tile } from '../models/tile';
import { ITileShape, TileShape } from '../models/tile-shape';
import { IAxialCoordinates, AxialCoordinates } from '../models/axial-coordinates';
import { ICubicCoordinates, CubicCoordinates } from '../models/cubic-coordinates';
import { IOffsetCoordinates, OffsetCoordinates} from '../models/offset-coordinates';

export class BoardGenerator {

    public createBoard(
        gameId: string, 
        tileShape: TileShape, 
        boardType: IBoardType, 
        columnsOrSideLength: number, 
        rows?: number
    ) {

        // Determine shape and tile layout
        let useTileShape = TileShape.fromObject(tileShape);
        let useBoardType = BoardType.fromObject(boardType);   

        // Validate column count
        if (columnsOrSideLength < 2) {
            throw new Error('Not enough tile row(s)/column(s) were specified');
        }
        // regular polygon boards enforce an odd number of column(s)
        if (useBoardType.centerOrigin && (columnsOrSideLength % 1 < 1)) {
            throw new Error('Board types with centered origin require an odd number of column(s)');
        }

        // Array to store rows of tiles (board)
        let tiles: ITile[] = [];

        // Build Rectangular board (fixed number of tiles per row)
        if (useBoardType.equals(BoardType.Rectangle)) {
            // Calculate width and height
            let columnCount = columnsOrSideLength;
            let rowCount = rows || columnsOrSideLength;  // Default to width (length of side)
            tiles = this.buildRectangle(columnCount, rowCount, tileShape);
        }

        // Build Regular polygon / convex shape board
        if (useBoardType.equals(BoardType.RegularPolygon)) {
            let sideLength = columnsOrSideLength;
            if (useTileShape.equals(TileShape.Square)) {
                tiles = this.buildSquare(sideLength, useBoardType.centerOrigin);
            }
            if (useTileShape.equals(TileShape.Octagonal)) {
                tiles = this.buildRegularOctagon(sideLength, useBoardType.centerOrigin);
            }
            if (useTileShape.equals(TileShape.Hexagonal)) {
                tiles = this.buildRegularHexagon(sideLength, useBoardType.centerOrigin);
            }
        }

        // Create new board 
        let board = Board.fromObject({ 
            boardType: useBoardType,
            gameId: gameId,
            tiles: tiles,
            tileShape: useTileShape
        });

        // return the board
        return board;
        
    }

    private buildRectangle(columnCount: number, rowCount: number, tileShape: TileShape) {
        let rectangle: Tile[] = [];
        let increment = tileShape.doubleIncrement ? 2 : 1;
        for(let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
            let row = rowIndex * increment;
            for (let colIndex = 0; colIndex < columnCount; colIndex++) {
                let col = colIndex * increment;
                let cubicCoordinates = CubicCoordinates.fromOffset(
                    OffsetCoordinates.fromObject({ row: row, col: col })
                );
                rectangle.push(Tile.fromObject({
                    cubicCoordinates: cubicCoordinates,
                    tileShape: tileShape
                }));
            }
        }
        return rectangle;
    }

    private buildSquare(sideLength: number, centerOrigin: boolean) {

        let square: Tile[] = [];
        let centerOffset = centerOrigin ? ((sideLength + 1) / 2) : 0;
        let increment = TileShape.Square.doubleIncrement ? 2 : 1;

        // Loop through rows x columns
        for (let rowIndex = 0; rowIndex < sideLength; rowIndex++) {
            let row = (rowIndex - centerOffset) * increment;
            for (let colIndex = 0; colIndex < sideLength; colIndex++) {
                let col = (colIndex - centerOffset) * increment;
                let cubicCoordinates = CubicCoordinates.fromOffset(
                    OffsetCoordinates.fromObject({ row: row, col: col })
                );
                square.push(Tile.fromObject({
                    cubicCoordinates: cubicCoordinates,
                    tileShape: TileShape.Square
                }));
            }
        }

        // return the square tiles
        return square;

    }

    private buildRegularOctagon(sideLength: number, centerOrigin: boolean) {

        let octagon: Tile[] = [];
        let increment = TileShape.Octagonal.doubleIncrement ? 2 : 1;
        let maxLength = sideLength + (2 * (sideLength - 1));
        let centerOffset = centerOrigin ? ((maxLength + 1) / 2) : 0;

        // Build top portion of octagon
        let rowLength = sideLength - 2;
        let rowIndex = -1;
        while(rowLength <= (maxLength - 2)) {
            rowLength += 2;
            rowIndex++;
            let row = (rowIndex - centerOffset) * increment;
            let colOffset = (maxLength - rowLength) / 2;
            for(let colIndex = 0; colIndex < rowLength; colIndex++) {
                let col = (colIndex + colOffset - centerOffset) * increment;
                octagon.push(Tile.fromObject({
                    cubicCoordinates: CubicCoordinates.fromOffset(
                        OffsetCoordinates.fromObject({ row: row, col: col })
                    ),
                    tileShape: TileShape.Octagonal
                }));
            }
        }

        // Build middle portion of octagon
        for(rowIndex = sideLength - 1; rowIndex < sideLength; rowIndex++) {
            rowLength = maxLength;
            rowIndex++;
            let row = (rowIndex  - centerOffset) * increment;
            for(let colIndex = 0; colIndex < rowLength; colIndex++) {
                let col = (colIndex - centerOffset) * increment;
                octagon.push(Tile.fromObject({
                    cubicCoordinates: CubicCoordinates.fromOffset(
                        OffsetCoordinates.fromObject({ row: row, col: col })
                    ),
                    tileShape: TileShape.Octagonal
                }));
            }
        }

        // Build bottom portion of octagon
        while(rowLength >= sideLength) {
            rowLength -= 2;
            rowIndex++;
            let row = (rowIndex - centerOffset) * increment;
            let colOffset = (maxLength - rowLength) / 2;
            for(let colIndex = 0; colIndex < rowLength; colIndex++) {
                let col = (colIndex + colOffset - centerOffset) * increment;
                octagon.push(Tile.fromObject({
                    cubicCoordinates: CubicCoordinates.fromOffset(
                        OffsetCoordinates.fromObject({ row: row, col: col })
                    ),
                    tileShape: TileShape.Octagonal
                }));
            }
        }

        // return the octagon tiles
        return octagon;

    }

    private buildRegularHexagon(sideLength: number, centerOrigin: boolean) {

        let hexagon: Tile[] = [];
        let increment = TileShape.Hexagonal.doubleIncrement ? 2 : 1;
        let maxLength = sideLength + (sideLength - 1);
        let centerOffset = centerOrigin ? ((maxLength - 1) / 2) : 0;

        // Build top portion of hexagon
        let rowLength = sideLength - 1;
        let rowIndex = -1;
        while(rowLength < (maxLength - 1)) {
            rowLength += 1;
            rowIndex++;
            let row = (rowIndex - centerOffset) * increment;
            let colOffset = (maxLength - rowLength) / 2; // TODO:  Fix bug where column offset produces fractional value
            for(let colIndex = 0; colIndex < rowLength; colIndex++) {
                let col = (colIndex + colOffset - centerOffset) * increment;
                hexagon.push(Tile.fromObject({
                    cubicCoordinates: CubicCoordinates.fromOffset(
                        OffsetCoordinates.fromObject({ row: row, col: col })
                    ),
                    tileShape: TileShape.Hexagonal
                }));
            }
        }

        // Build middle row of hexagon
        rowIndex = sideLength;
        rowLength = maxLength;
        let row = (rowIndex - centerOffset) * increment;
        for(let colIndex = 0; colIndex < rowLength; colIndex++) {
            let col = (colIndex - centerOffset) * increment;
            hexagon.push(Tile.fromObject({
                cubicCoordinates: CubicCoordinates.fromOffset(
                    OffsetCoordinates.fromObject({ row: row, col: col })
                ),
                tileShape: TileShape.Hexagonal
            }));
        }

        // Build bottom portion of octagon
        while(rowLength >= sideLength) {
            rowLength -= 1;
            rowIndex++;
            let row = (rowIndex - centerOffset) * increment;
            let colOffset = (maxLength - rowLength) / 2; // TODO:  Fix bug where column offset produces fractional value
            for(let colIndex = 0; colIndex < rowLength; colIndex++) {
                let col = (colIndex + colOffset - centerOffset) * increment;
                hexagon.push(Tile.fromObject({
                    cubicCoordinates: CubicCoordinates.fromOffset(
                        OffsetCoordinates.fromObject({ row: row, col: col })
                    ),
                    tileShape: TileShape.Hexagonal
                }));
            }
        }
        
        // return the hexagon tiles
        return hexagon;
        
    }

}