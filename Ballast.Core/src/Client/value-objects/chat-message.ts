export interface IChatMessage {
    gameId: string | null;
    channel: string;
    from: string;
    text: string;
    isoDateTime: string;
}
