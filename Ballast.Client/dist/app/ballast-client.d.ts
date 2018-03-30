import { BallastViewport } from './ballast-viewport';
export declare class BallastClient {
    private readonly host;
    private readonly id;
    private readonly viewport;
    private readonly inversifyContainer;
    constructor(host: HTMLElement);
    getId(): string;
    getViewport(): BallastViewport;
    loadAsync(): Promise<BallastClient>;
}