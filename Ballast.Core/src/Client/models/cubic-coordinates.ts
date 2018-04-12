import { IAxialCoordinates, AxialCoordinates } from './axial-coordinates';
import { IOffsetCoordinates, OffsetCoordinates } from './offset-coordinates';

export interface ICubicCoordinates extends IAxialCoordinates {
    y: number;
}

export class CubicCoordinates implements ICubicCoordinates {

    public readonly x: number;
    public readonly y: number;
    public readonly z: number;

    private constructor(state: ICubicCoordinates) {
        if ((state.x + state.y + state.z) != 0) {
            throw new Error("Provided object coordinate(s) do not match constraint 'x + y + z = 0'");
        }
        this.x = state.x;
        this.y = state.y;
        this.z = state.z;
    }

    public static fromObject(object: ICubicCoordinates) {
        return new CubicCoordinates(object);
    }

    public static fromAxial(object: IAxialCoordinates) {
        let y = -1 * (object.x + object.z);
        return new CubicCoordinates({ x: object.x, y: y, z: object.z });
    }

    public static fromOffset(object: IOffsetCoordinates) {
        var x = object.col - (object.row - (object.row & 1)) / 2;
        var z = object.row;
        var y = -1 * (x + z);
        return new CubicCoordinates({x: x, y: y, z: z });
    }

    public equals(object: ICubicCoordinates) {
        if (!object) {
            return false;
        }
        return (
            this.x == object.x &&
            this.y == object.y &&
            this.z == object.z
        );
    }

    public equalsAxial(object: IAxialCoordinates) {
        return CubicCoordinates
            .fromAxial(object)
            .equals(this);
    }

    public equalsOffset(object: IOffsetCoordinates) {
        return CubicCoordinates
            .fromOffset(object)
            .equals(this);
    }

    public toOrderedTriple() {
        return [this.x, this.y, this.z];
    }

}