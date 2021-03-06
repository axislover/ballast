import { GameStateChangedEvent, IEventBus, IGame } from 'ballast-core';
import * as THREE from 'three';
import { KeyboardWatcher } from '../input/keyboard-watcher';

export class RenderingContext {

    public readonly canvas: HTMLCanvasElement;
    public readonly keyboard: KeyboardWatcher;
    public readonly renderer: THREE.WebGLRenderer;
    public readonly scene: THREE.Scene;
    public readonly camera: THREE.PerspectiveCamera;
    public readonly cameraPivot: THREE.Object3D;
    public readonly clock: THREE.Clock;
    public userName?: string;

    public get game() {
        return this.currentGame;
    }

    private readonly eventBus: IEventBus;
    private currentGame?: IGame;
    private frameDelta: number;

    public constructor(canvas: HTMLCanvasElement, keyboardWatcher: KeyboardWatcher, eventBus: IEventBus) {
        this.canvas = canvas;
        this.keyboard = keyboardWatcher;
        this.eventBus = eventBus;
        this.renderer = this.createRenderer(this.canvas);
        this.scene = this.createScene();
        this.camera = this.createCamera(this.canvas);
        this.cameraPivot = this.createCameraPivot(this.scene, this.camera);
        this.clock = new THREE.Clock();
        this.frameDelta = 0;
        this.currentGame = undefined;
        this.subscribeToEvents();
    }

    private createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
        var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setPixelRatio(1);
        return renderer;
    }

    private createScene(): THREE.Scene {
        return new THREE.Scene();
    }

    private createCamera(canvas: HTMLCanvasElement): THREE.PerspectiveCamera {
        let aspect = canvas.clientWidth / canvas.clientHeight;
        let camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        return camera;
    }

    private createCameraPivot(scene: THREE.Scene, camera: THREE.Camera): THREE.Object3D {
        let cameraPivot = new THREE.Object3D();
        cameraPivot.position.copy(scene.position);
        cameraPivot.rotation.reorder('YXZ');
        cameraPivot.add(camera);
        scene.add(cameraPivot);
        return cameraPivot;
    }

    private subscribeToEvents() {
        this.eventBus.subscribe<GameStateChangedEvent>(GameStateChangedEvent.id, this.onGameStateChangedAsync.bind(this));
    }

    private async onGameStateChangedAsync(event: GameStateChangedEvent): Promise<void> {
        this.setCurrentGame(event.game);
    }

    public setCurrentGame(game?: IGame) {
        this.currentGame = game;
    }

    public refreshFrameDelta() {
        this.frameDelta = this.clock.getDelta();
    }

    public getCurrentFrameDelta() {
        return this.frameDelta;
    }

    public attachCameraToObject(object: THREE.Object3D) {
        if (this.cameraPivot.parent != object) {
            this.scene.remove(this.cameraPivot);
            object.add(this.cameraPivot);
        }
        return object;
    }

    public detachCameraFromObject(object: THREE.Object3D) {
        if (this.cameraPivot.parent == object) {
            object.remove(this.cameraPivot);
            this.scene.add(this.cameraPivot);
        }
        return object;
    }
    

}