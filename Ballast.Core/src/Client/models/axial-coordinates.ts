import { ICubicCoordinates, CubicCoordinates } from './cubic-coordinates';
import { IOffsetCoordinates, OffsetCoordinates } from './offset-coordinates';

export interface IAxialCoordinates { 
    x: number;
    z: number;
}

export class AxialCoordinates implements IAxialCoordinates {

    public readonly x: number;
    public readonly z: number;

    private constructor(state: IAxialCoordinates) {
        this.x = state.x;
        this.z = state.z;
        if (this.x == -0)
            this.x = 0;
        if (this.z == -0)
            this.z = 0;
    }

    public static fromObject(object: IAxialCoordinates) {
        return new AxialCoordinates(object);
    }

    public static fromCubic(object: ICubicCoordinates) {
        return AxialCoordinates.fromObject(object);
    }

    public static fromOffset(object: IOffsetCoordinates) {
        return AxialCoordinates.fromCubic(
            CubicCoordinates.fromOffset(object)
        );
    }

    public equals(object: IAxialCoordinates) {
        if (!object) {
            return false;
        }
        return (
            this.x == object.x &&
            this.z == object.z
        );
    }

    public equalsCubic(object: ICubicCoordinates) {
        return AxialCoordinates
            .fromCubic(object)
            .equals(this);
    }

    public toCubic() {
        return CubicCoordinates.fromAxial(this);
    }

    public toOffset() {
        return OffsetCoordinates.fromAxial(this);
    }

    public toOrderedPair() {
        return [this.x, this.z];
    }

}