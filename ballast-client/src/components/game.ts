import { Game, GameStateChangedEvent, IDirection, IEventBus, Tile, Vessel, getUtcNow, VesselStateChangedEvent } from 'ballast-core';
import { inject, injectable } from 'inversify';
import * as THREE from 'three';
import { BallastViewport } from '../app/ballast-viewport';
import { PerspectiveTracker } from '../input/perspective-tracker';
import { TYPES_BALLAST } from '../ioc/types';
import { GameComponentLoadedEvent } from '../messaging/events/game-component-loaded';
import { RenderingConstants } from '../rendering/rendering-constants';
import { RenderingContext } from '../rendering/rendering-context';
import { IGameClientService } from '../services/game-client-service';
import { BoardComponent } from './board';
import { ComponentBase } from './component-base';
import { WorldComponent } from './world';
import { NavigationComponent } from './navigation';

type AnimationType = 'counterClockwise' | 'clockwise' | 'forward';
type Animation = { type: AnimationType, timestamp: number };

@injectable()
export class GameComponent extends ComponentBase {

    // Vessel object(s)
    private readonly vessel: THREE.Mesh;
    private readonly vesselPivot: THREE.Object3D;

    // Buttons & click listeners
    private readonly clockwiseButton: HTMLButtonElement;
    private readonly clockwiseClickListener: (this: HTMLButtonElement, ev: MouseEvent) => any;
    private readonly counterClockwiseButton: HTMLButtonElement;
    private readonly counterClockwiseClickListener: (this: HTMLButtonElement, ev: MouseEvent) => any;
    private readonly moveForwardButton: HTMLButtonElement;
    private readonly moveForwardButtonClickListener: (this: HTMLButtonElement, ev: MouseEvent) => any;

    // Animation (movement / rotation) flags & triggers
    private animationQueue: Animation[];

    // Forward movemement flags/triggers
    private readonly forwardMovementTarget: THREE.Object3D;
    private readonly forwardMovementSource: THREE.Object3D;
    private readonly forwardMovementAnimationDuration: number;
    private forwardMovementClock?: THREE.Clock;
    private waitingOnMovementRequest: boolean;
    //private triggerForwardMovement?: number;

    // Rotation flags/triggers 
    private readonly rotationTarget: THREE.Object3D;
    private readonly rotationAnimationDuration: number;
    private rotationDirections: number;
    private rotationRadians: number;
    private rotationClock?: THREE.Clock;
    private rotationClockwise?: boolean;
    //private triggerClockwiseRotation?: number;
    //private triggerCounterClockwiseRotation?: number;

    // Current game / state
    private readonly gameService: IGameClientService;
    private readonly gameStateChangedHandler: (evt: GameStateChangedEvent) => Promise<void>;
    private currentGame?: Game;
    private readonly vesselStateChangedHandler: (evt: VesselStateChangedEvent) => Promise<void>;
    private currentVessel?: Vessel;
    //private currentTile?: Tile;

    // Child components
    private readonly world: WorldComponent;
    private readonly board: BoardComponent;
    private readonly navigation: NavigationComponent;

    public constructor(
        @inject(TYPES_BALLAST.BallastViewport) viewport: BallastViewport,
        @inject(TYPES_BALLAST.IEventBus) eventBus: IEventBus,
        @inject(TYPES_BALLAST.PerspectiveTracker) perspectiveTracker: PerspectiveTracker,
        @inject(TYPES_BALLAST.IGameClientService) gameClientService: IGameClientService,
        @inject(TYPES_BALLAST.WorldComponentFactory) worldFactory: () => WorldComponent,
        @inject(TYPES_BALLAST.BoardComponentFactory) boardFactory: () => BoardComponent,
        @inject(TYPES_BALLAST.NavigationComponentFactory) navigationFactory: () => NavigationComponent) {
            
        // base constructor
        super(viewport, eventBus, perspectiveTracker);

        // Create vessel 3d object(s)
        let vesselObjects = this.createVesselObjects();
        this.vessel = vesselObjects["0"];
        this.vesselPivot = vesselObjects["1"];

        // Create buttons & click listeners
        let buttons = this.createMovementButtons()
        this.moveForwardButton = buttons["0"];
        this.moveForwardButtonClickListener = this.onMoveForwardClick.bind(this);
        this.counterClockwiseButton = buttons["1"];
        this.counterClockwiseClickListener = this.onCounterClockwiseClick.bind(this);
        this.clockwiseButton = buttons["2"];
        this.clockwiseClickListener = this.onClockwiseClick.bind(this);

        // Trigger(s) & properties for object forward movement animation(s)
        this.animationQueue = [];
        this.waitingOnMovementRequest = false;
        let forwardMovementObjects = this.createForwardMovementObjects();
        this.forwardMovementTarget = forwardMovementObjects["0"];
        this.forwardMovementSource = forwardMovementObjects["1"];
        this.forwardMovementAnimationDuration = RenderingConstants.MOVEMENT_DURATION_SECONDS;

        // Trigger(s) & properties for object rotation animation(s)
        this.rotationTarget = this.createRotationTarget();
        this.rotationAnimationDuration = RenderingConstants.PIVOT_DURATION_SECONDS;
        this.rotationRadians = RenderingConstants.EIGHTH_TURN_RADIANS; // Default to 8 directions
        this.rotationDirections = 8; // Default to 8 directions

        // Game state update listener
        this.gameService = gameClientService;
        this.gameStateChangedHandler = this.onGameStateChangedAsync.bind(this);
        this.vesselStateChangedHandler = this.onVesselStateChangedAsync.bind(this);

        // Create child components
        this.world = worldFactory();
        this.board = boardFactory();
        this.navigation = navigationFactory();

    }

    private createVesselObjects(): [THREE.Mesh, THREE.Object3D] {
        // Create vessel mesh
        let vesselGeometry = new THREE.DodecahedronGeometry(1);
        //let vesselGeometry = new THREE.SphereGeometry( 1, 24, 24 );
        let vesselMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
        let vessel = new THREE.Mesh(vesselGeometry, vesselMaterial);
        // Create vessel parent/pivot object
        let vesselPivot = new THREE.Object3D();
        vesselPivot.position.set(0, 0, 0);
        vesselPivot.rotation.reorder('YXZ');
        vesselPivot.rotateY(RenderingConstants.INITIAL_ORIENTATION_RADIANS)
        vesselPivot.add(vessel);
        // Return all objects
        return [vessel, vesselPivot];
    }

    private createForwardMovementObjects(): [THREE.Object3D, THREE.Object3D] {
        let forwardMovementTarget = new THREE.Object3D();
        let forwardMovementSource = new THREE.Object3D();
        return [forwardMovementTarget, forwardMovementSource];
    }

    private createRotationTarget() {
        let rotationTarget = new THREE.Object3D();
        rotationTarget.rotation.reorder('YXZ');
        return rotationTarget;
    }

    private createMovementButtons(): [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement] {

        // Add some CSS to the game style header tag for media query'ing the buttons
        let style = this.viewport.getGameStyle();
        let ownerDocument = style.ownerDocument;
        style.appendChild(ownerDocument.createTextNode(`
            .ballastMoveForwardButton {
                position: absolute;
                color: white;
                background-color: transparent;
                border-width: 0px;
                border-style: solid;
                border-color: rgba(255, 255, 255, 0.1);
                text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
                font-size: 5vw;
                top: 15%;
                left: 50%;
                transform: translate(-50%, -50%)
            }
            .ballastRotateButton { 
                transform: rotate(180deg);
                position: absolute;
                color: white;
                background-color: transparent;
                border-width: 0px;
                border-style: solid;
                border-color: rgba(255, 255, 255, 0.1);
                text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
                font-size: 5vw;
                top: 10%;
            } 
            @media screen and (min-width: 1000px) { 
                .ballastMoveForwardButton { 
                    font-size: 50px;
                } 
                .ballastRotateButton { 
                    font-size: 50px;
                } 
            }
        `));

        // Move forward button (top middle)
        let moveForwardButton = ownerDocument.createElement('button');
        moveForwardButton.innerHTML = '&#8593';
        moveForwardButton.type = 'button';
        moveForwardButton.className = 'ballastMoveForwardButton';

        // Counter clockwise button (top right)
        let counterClockwiseButton = ownerDocument.createElement('button');
        counterClockwiseButton.innerHTML = '&#8634';
        counterClockwiseButton.type = 'button';
        counterClockwiseButton.className = 'ballastRotateButton';
        counterClockwiseButton.style.cssFloat = 'left';
        counterClockwiseButton.style.left = '5.63%';

        // Counter clockwise button (top left)
        let clockwiseButton = ownerDocument.createElement('button');
        clockwiseButton.innerHTML = '&#8635';
        clockwiseButton.type = 'button';
        clockwiseButton.className = 'ballastRotateButton';
        clockwiseButton.style.cssFloat = 'right';
        clockwiseButton.style.right = '5.63%';

        // Return both buttons
        return [moveForwardButton, counterClockwiseButton, clockwiseButton];

    }

    private subscribeToEvents() {
        this.eventBus.subscribe(GameStateChangedEvent.id, this.gameStateChangedHandler);
        this.eventBus.subscribe(VesselStateChangedEvent.id, this.vesselStateChangedHandler);
        this.moveForwardButton.addEventListener('click', this.moveForwardButtonClickListener);
        this.counterClockwiseButton.addEventListener('click', this.counterClockwiseClickListener);
        this.clockwiseButton.addEventListener('click', this.clockwiseClickListener);
    }

    private unsubscribeFromEvents() {
        this.eventBus.unsubscribe(GameStateChangedEvent.id, this.gameStateChangedHandler);
        this.eventBus.unsubscribe(VesselStateChangedEvent.id, this.vesselStateChangedHandler);
        this.moveForwardButton.removeEventListener('click', this.moveForwardButtonClickListener);
        this.counterClockwiseButton.removeEventListener('click', this.counterClockwiseClickListener);
        this.clockwiseButton.removeEventListener('click', this.clockwiseClickListener);
    }

    protected onAttach(parent: HTMLElement, renderingContext: RenderingContext) {

        // Add camera as child of vessel & add vessel into secene
        renderingContext.scene.add(renderingContext.attachCameraToObject(this.vesselPivot));

        // Add buttons to parent element
        parent.appendChild(this.clockwiseButton);
        parent.appendChild(this.moveForwardButton);
        parent.appendChild(this.counterClockwiseButton);

        // Subscribe to click & domain events
        this.subscribeToEvents();

        // Attach child components
        this.world.attach(parent);
        this.board.attach(parent);
        this.navigation.attach(parent);

        // Notify game component finished loading
        this.eventBus.publishAsync(GameComponentLoadedEvent.createNew());

    }

    protected onDetach(parent: HTMLElement, renderingContext: RenderingContext) {

        // Disconnect from the chat service/hub
        if (this.gameService.isConnected) {
            this.gameService.disconnectAsync(); // Fire and forget
        }

        // Remove camera pivot from the vessel object
        renderingContext.detachCameraFromObject(this.vesselPivot);

        // Remove buttons from parent element
        parent.removeChild(this.clockwiseButton);
        parent.removeChild(this.moveForwardButton);
        parent.removeChild(this.counterClockwiseButton);

        // Detach child components
        this.navigation.detach();
        this.board.detach();
        this.world.detach();

        // Unsubscribe from click & domain events
        this.unsubscribeFromEvents();

    }

    protected render(parent: HTMLElement, renderingContext: RenderingContext) {

        // Reset objects if we have a new game
        let isNewGame = (renderingContext.game && (!this.currentGame || this.currentGame.id != renderingContext.game.id)) || false;
        if (isNewGame) {
            this.resetGame(renderingContext);
        }

        // Get keyboard input
        let leftIsDown = renderingContext.keyboard.leftArrowIsDown();
        let rightIsDown = renderingContext.keyboard.rightArrowIsDown();
        let aIsDown = renderingContext.keyboard.aIsDown();
        let dIsDown = renderingContext.keyboard.dIsDown();
        let upArrowIsDown = renderingContext.keyboard.upArrowIsDown();
        let wIsDown = renderingContext.keyboard.wIsDown();

        // Determine if keyboard is requesting animation
        let left = leftIsDown || aIsDown;
        let right = rightIsDown || dIsDown;
        let rotate = (left && !right) || (right && !left); // Rotation only triggers if left/right not cancelling each other out
        if (!rotate) {
            left = false;
            right = false;
        }
        let forward = !rotate && (upArrowIsDown || wIsDown); // Rotation takes precedence over forward movement

        // Check if we are busy with a movement request or an animation (ignore keyboard)
        let ignoreKeyboard = this.waitingOnMovementRequest || this.isMidAnimation || this.hasQueuedAnimation;
        if (ignoreKeyboard) {
            left = false;
            right = false;
            forward = false;
        }

        // If we are not mid-animation or waiting on movement request, but we do have a queued animation
        let startQueuedAnimation = !this.waitingOnMovementRequest && !this.isMidAnimation && this.hasQueuedAnimation;
        if (startQueuedAnimation) {
            // Set flags from the queued animation 
            let nextAnimation = <Animation>this.dequeueNextAnimation();
            if (nextAnimation.type == 'counterClockwise') {
                left = true;
            }
            if (nextAnimation.type == 'clockwise') {
                right = true;
            }
            if (nextAnimation.type == 'forward') {
                forward = true;
            }
        }

        // Apply rotation animation
        this.applyRotation(
            renderingContext, 
            left, 
            right
        );

        // Apply forward movement animation
        this.applyForwardMovement(
            renderingContext, 
            forward
        );

    }

    private get isMidAnimation(): boolean {
        return (!!this.rotationClock || !!this.forwardMovementClock);
    }

    private get hasQueuedAnimation(): boolean {
        return (!!this.animationQueue.length);
    }

    private dequeueNextAnimation(): Animation | null {
        if (!this.animationQueue.length) {
            return null;
        }
        let nextAnimation = this.animationQueue.splice(0, 1)[0];
        return nextAnimation;
    }

    private queueNewAnimation(animationType: AnimationType) {
        // If we already have more than one animation, check to see if the new animation cancels out the last one
        let cancelLastAnimation = false;
        if (this.animationQueue.length > 1) {
            let lastAnimation = this.animationQueue[this.animationQueue.length - 1];
            if (lastAnimation.type == 'clockwise' && animationType == 'counterClockwise') {
                cancelLastAnimation = true;
            }
            if (lastAnimation.type == 'counterClockwise' && animationType == 'clockwise') {
                cancelLastAnimation = true;
            }
        }
        if (cancelLastAnimation) {
            this.animationQueue.pop();
            return;
        }
        // Queue the animation
        let timestamp = Date.now();
        this.animationQueue.push({ type: animationType, timestamp: timestamp });
    }

    private getVesselVector3(vessel: Vessel | undefined): THREE.Vector3 {
        if (!vessel) {
            return new THREE.Vector3(0,0,0);
        }
        let tilePosition = this.board.getTilePosition(vessel.cubicCoordinates);
        return tilePosition || new THREE.Vector3(0,0,0);
    }

    private resetGame(renderingContext: RenderingContext) {

        let clientId = this.viewport.getClientId();

        // Store info from new game state
        this.currentGame = <Game>renderingContext.game;
        this.currentVessel = this.currentGame && this.currentGame.vessels && this.currentGame.vessels
            .find(x => 
                (x.captain && x.captain.id == clientId) ||
                (x.radioman && x.radioman.id == clientId) || 
                false
            ); // TODO:  Fix this
        this.rotationDirections = this.currentGame && this.currentGame.board.tileShape.possibleDirections || 8;
        if (this.currentGame && this.rotationDirections == 6) {
            this.rotationRadians = RenderingConstants.SIXTH_TURN_RADIANS;
        } else if (this.currentGame && this.rotationDirections == 4) {
            this.rotationRadians = RenderingConstants.QUARTER_TURN_RADIANS;
        } else {
            this.rotationRadians = RenderingConstants.EIGHTH_TURN_RADIANS;
        }

        // Update vessel pivot orientation
        let initialY = RenderingConstants.INITIAL_ORIENTATION_RADIANS;
        this.vesselPivot.rotation.set(0, initialY, 0);
        this.rotationTarget.rotation.set(0, initialY, 0);

        // Update vessel properties
        let vesselPivotV3 = this.getVesselVector3(this.currentVessel);
        this.vessel.position.set(0, 0, 0);
        this.vesselPivot.position.fromArray(vesselPivotV3.toArray()); 
        this.forwardMovementTarget.position.fromArray(vesselPivotV3.toArray());
    }

    private applyRotation(renderingContext: RenderingContext, left: boolean, right: boolean) {

        // Determine if we are mid-rotation
        let midRotation = !!this.rotationClock;

        // Get time since last orbit adjustment (if applicable)
        let rotationDelta = 0;
        if (midRotation) {
            rotationDelta = (this.rotationClock as THREE.Clock).getDelta();
        }

        // Check if we need to trigger a new orbit
        let triggerNewRotation = !midRotation && (!right && left || !left && right);
        if (triggerNewRotation) {
            this.rotationClockwise = right;
            let thetaRadians = this.rotationRadians;
            if (this.rotationClockwise)
                thetaRadians *= -1;
            this.rotationClock = new THREE.Clock();
            this.rotationTarget.rotateY(thetaRadians);
        }

        // If we need to adjust for seconds elapsed while mid-orbit
        if (rotationDelta > 0) {

            // Check if we have reached the end of the rotation animation (time)
            let totalOrbitDelta = (this.rotationClock as THREE.Clock).getElapsedTime();
            if (totalOrbitDelta >= (this.rotationAnimationDuration)) {

                // Move directly to final orientation
                this.vesselPivot.rotation.setFromVector3(
                    this.rotationTarget.rotation.toVector3()
                );

                // finished rotating
                this.rotationClockwise = undefined;
                this.rotationClock = undefined;

            } else {

                // Calculate how much of a partial turn we need to rotate by
                let partialTurns = rotationDelta * (1 / this.rotationAnimationDuration);

                // Convert partial turns to radians
                let thetaRadians = partialTurns * this.rotationRadians;
                if (this.rotationClockwise)
                    thetaRadians *= -1;

                // Rotate our vessel pivot object
                this.vesselPivot.rotateY(thetaRadians);

            }

        }

    }

    private applyForwardMovement(renderingContext: RenderingContext, forward: boolean) {

        // Determine if we are mid-movement
        let midForwardMovement = !!this.forwardMovementClock;

        // Get time since last movement adjustment (if applicable)
        let forwardMovementDelta = 0;
        if (midForwardMovement) {
            forwardMovementDelta = (this.forwardMovementClock as THREE.Clock).getDelta();
        }

        // Check if we need to trigger a new movement
        let triggerNewForwardMovement = !midForwardMovement && forward;
        if (triggerNewForwardMovement) {
            // Reset the clock (just in case we were stuck animating a previous movement for some reason ???)
            this.forwardMovementClock = undefined;
            // Request/trigger the movement forward (async)
            this.moveForwardAsync(renderingContext)
                .then((vessel) => {
                    // When the server responds back with the movement result, we can start the animation clock
                    // This will be picked up on the next render loop iteration and "midForwardMovement" will be "true"
                    this.currentVessel = vessel;
                    let newVesselPosition = this.getVesselVector3(vessel);
                    this.forwardMovementClock = new THREE.Clock();
                    this.forwardMovementSource.position.set(this.vesselPivot.position.x, this.vesselPivot.position.y, this.vesselPivot.position.z);
                    this.forwardMovementTarget.position.set(newVesselPosition.x, newVesselPosition.y, newVesselPosition.z);
                })
                .catch((err) => console.log(err));
        }

        // If we need to adjust for seconds elapsed while mid-orbit
        if (forwardMovementDelta > 0) {

            // Check if we have reached the end of the movement animation (time)
            let totalMovementDelta = (this.forwardMovementClock as THREE.Clock).getElapsedTime();
            if (totalMovementDelta >= (this.forwardMovementAnimationDuration)) {

                // Move directly to final position
                this.vesselPivot.position.set(
                    this.forwardMovementTarget.position.x,
                    this.forwardMovementTarget.position.y,
                    this.forwardMovementTarget.position.z
                );

                // finished movement
                this.forwardMovementClock = undefined;

            } else {

                // Calculate how much of a partial movement we need to advance
                //let partialMovement = forwardMovementDelta * (1 / this.forwardMovementAnimationDuration);

                // Linearly interpolate using the partial movement alpha (%) from the current vessel pivot position
                // toward the desired (target) position
                //this.vesselPivot.position.lerp(this.forwardMovementTarget.position, partialMovement);

                let partialMovementPercentage = totalMovementDelta / this.forwardMovementAnimationDuration;

                // Clone the beginning (source) of forward movement so we can calculate how far we should have moved by now
                let nextPosition = this.forwardMovementSource.clone()
                    .position.lerp(this.forwardMovementTarget.position, partialMovementPercentage);
                
                this.vesselPivot.position.set(nextPosition.x, nextPosition.y, nextPosition.z);

            }

        }

    }

    private async moveForwardAsync(renderingContext: RenderingContext) {
        // Set flag so that no new movements will be processed in render loop until we get the result of this one
        this.waitingOnMovementRequest = true;
        let vessel: Vessel;
        try 
        {
            // Create request to move forward (async)
            vessel = await this.requestForwardMovementResultAsync();
            // TODO:  Fix this so that the game state is automatically refreshed by events
            if (this.currentGame) {
                this.currentGame.updateVesselCoordinates(vessel.id, vessel.cubicCoordinates);
                this.currentVessel = this.currentGame.vessels.find(x => x.id == vessel.id);
            } else {
                this.currentVessel = vessel;
            }
        }
        finally 
        {
            // Movement is complete
            this.waitingOnMovementRequest = false;
        }
        // Return the new vessel state
        return vessel;
    }

    private synchronizeVessel() {
        // TODO:  Create new animation type that flushes current queue 
        //        and brings the vessel to the correct position (immediately)
        throw new Error('Not implemented');
    }

    private getCurrentTile(): Tile {
        if (!this.currentGame) {
            throw new Error('Cannot calculate tile position(s) without a game/board instance');
        }
        if (!this.currentVessel) {
            throw new Error('Cannot calculate tile position(s) without vessel coordinates');
        }
        let currentTile = this.currentGame.board.getTileFromCoordinates(this.currentVessel.cubicCoordinates);
        if (!currentTile) {
            throw new Error('Could not match a tile to coordinates');
        }
        return currentTile;
    }

    private getForwardDirection(): IDirection {
        if (!this.currentGame) {
            throw new Error('Cannot determine forward cardinal direction without current game/board');
        }
        let tileShape = this.currentGame.board.tileShape;
        return this.perspectiveTracker.getCardinalDirection(tileShape, this.vesselPivot);
    }

    private async requestForwardMovementResultAsync(): Promise<Vessel> {
        if (!this.currentGame) {
            throw new Error('Cannot calculate movement(s) without a game/board instance');
        }
        if (!this.currentVessel) {
            throw new Error('Cannot calculate movement(s) without vessel coordinates');
        }
        // Get the current tile
        let currentTile = this.getCurrentTile();
        // Determine direction
        let direction = this.getForwardDirection();
        // Create a vessel move request
        let vessel = await this.gameService.moveVesselAsync({
            gameId: this.currentGame.id,
            vesselId: this.currentVessel.id,
            direction: direction,
            sourceOrderedTriple: currentTile.cubicCoordinates.toOrderedTriple(),
            targetOrderedTriple: [],
            isoDateTime: getUtcNow().toISOString()
        })
        // return the new vessel state
        return Vessel.fromObject(vessel);
    }

    private onMoveForwardClick(ev: MouseEvent) {
        this.queueNewAnimation('forward');
    }

    private onCounterClockwiseClick(ev: MouseEvent) {
        this.queueNewAnimation('counterClockwise');
    }

    private onClockwiseClick(ev: MouseEvent) {
        this.queueNewAnimation('clockwise');
    }

    private async onGameStateChangedAsync(evt: GameStateChangedEvent): Promise<void> {
        // Always make sure to store the latest game state for the current game
        if (this.currentGame && evt.game && this.currentGame.id == evt.game.id) {
            this.currentGame = evt.game;
        }
    }

    private async onVesselStateChangedAsync(evt: VesselStateChangedEvent): Promise<void> {
        // Always make sure to store the latest vessel state for the current vessel
        if (this.currentVessel && this.currentVessel.id == evt.vessel.id) {
            this.currentVessel = evt.vessel;
        }
    }

}