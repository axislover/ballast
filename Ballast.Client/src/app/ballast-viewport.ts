export type RenderingStep = (renderingContext: CanvasRenderingContext2D, next: () => void) => void;

export class BallastViewport {
    
    private readonly root: HTMLDivElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly renderingContext: CanvasRenderingContext2D;
    private readonly renderingSteps: Map<Symbol, RenderingStep>;

    public constructor(host: HTMLElement, clientId: string) {
        this.root = this.createRoot(host, clientId);
        this.canvas = this.createCanvas(this.root);
        this.renderingContext = this.createRenderingContext(this.canvas);
        this.renderingSteps = new Map<Symbol, RenderingStep>();
    }

    public getRoot(): HTMLDivElement {
        return this.root;
    }

    public getRenderingSteps(): RenderingStep[] {
        return Array.from(this.renderingSteps.values());
    }

    private createRoot(host: HTMLElement, id: string): HTMLDivElement {
        var root = host.ownerDocument.createElement("div");
        root.id = id;
        root.style.height = '100%';
        root.style.width = '100%';
        host.appendChild(root);
        return root;
    }

    private createCanvas(root: HTMLDivElement) {
        var canvas = root.ownerDocument.createElement('canvas');
        canvas.id = root.id + '_canvas';
        canvas.style.display = 'block';
        canvas.style.height = '100%';
        canvas.style.width = '100%';
        root.appendChild(canvas);
        return canvas;
    }

    private createRenderingContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
        var renderingContext =  this.canvas.getContext('2d');
        if (!renderingContext) {
            throw new Error('Could not create rendering context from canvas');
        }
        return renderingContext;
    }

    private resizeCanvas(canvas: HTMLCanvasElement) {
        // Lookup the size the browser is displaying the canvas.
        var displayWidth  = canvas.clientWidth;
        var displayHeight = canvas.clientHeight;
        // Check if the canvas is not the same size.
        if (canvas.width  != displayWidth ||
            canvas.height != displayHeight) {
            // Make the canvas the same size
            canvas.width  = displayWidth;
            canvas.height = displayHeight;
        }
    }

    private renderLoop() {
        requestAnimationFrame(() => this.renderLoop());
        this.render();
    }

    private prerender = (renderingContext: CanvasRenderingContext2D) => {
        // initial render step goes here
        this.resizeCanvas(renderingContext.canvas);
        renderingContext.clearRect(0, 0, renderingContext.canvas.clientWidth, renderingContext.canvas.clientHeight);
    };

    private postrender: RenderingStep = (renderingContext, next) => { 
        // final render step goes here
    };

    private render(): void {
        var renderingSteps = this.getRenderingSteps();
        var i = renderingSteps.length;
        let next = this.postrender;
        this.prerender(this.renderingContext);
        while (i--) {
            next = renderingSteps[i].call(this, this.renderingContext, next);
        }
    }

    public addRenderingStep(id: Symbol, renderingStep: RenderingStep) {
        this.renderingSteps.set(id, renderingStep);
    }

    public removeRenderingStep(id: Symbol) {
        this.renderingSteps.delete(id);
    }

    public startRenderLoop() {
        this.renderLoop();
    }

}