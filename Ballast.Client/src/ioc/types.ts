const TYPES_BALLAST = {

    // app
    BallastBootstrapper: Symbol.for('BallastBootstrapper'),
    BallastClient: Symbol.for('BallastClient'),
    BallastViewport: Symbol.for('BallastViewport'),

    // components
    BoardComponent: Symbol.for('BoardComponent'),
    BoardComponentFactory: Symbol.for('BoardComponentFactory'),
    CameraComponent: Symbol.for('CameraComponent'),
    CameraComponentFactory: Symbol.for('CameraComponentFactory'),
    ChatComponent: Symbol.for('ChatComponent'),
    ChatComponentFactory: Symbol.for('ChatComponentFactory'),
    GameComponent: Symbol.for('GameComponent'),
    GameComponentFactory: Symbol.for('GameComponentFactory'),
    HudComponent: Symbol.for('HudComponent'),
    HudComponentFactory: Symbol.for('HudComponentFactory'),
    MenuComponent: Symbol.for('MenuComponent'),
    MenuComponentFactory: Symbol.for('MenuComponentFactory'),
    RootComponent: Symbol.for('RootComponent'),
    RootComponentFactory: Symbol.for('RootComponentFactory'),
    SignInComponent: Symbol.for('SignInComponent'),
    SignInComponentFactory: Symbol.for('SignInComponentFactory'),

    // input
    KeyboardWatcher: Symbol.for('KeyboardWatcher'),
    PerspectiveTracker: Symbol.for('PerspectiveTracker'),
    
    // messaging
    IEventBus: Symbol.for('IEventBus'),

    // rendering
    RenderingContext: Symbol.for('RenderingContext')

};

export { TYPES_BALLAST };