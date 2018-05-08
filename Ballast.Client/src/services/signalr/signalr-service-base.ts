import { injectable, inject } from 'inversify';
import * as signalR from '@aspnet/signalr';
import { v4 as uuid } from 'uuid';
import { TYPES_BALLAST } from '../../ioc/types';
import { ISignalRServiceOptions } from './signalr-service-options';
import { IDisposable, IEventBus } from 'ballast-core'; 

export type SignalRServiceInvocationResolver<TValue extends any> = (value?: TValue) => void;
export type SignalRServiceInvocationRejector = (reason?: string) => void;
export type SignalRServiceUnfulfilledInvocation<TValue extends any> = [
    SignalRServiceInvocationResolver<TValue>,
    SignalRServiceInvocationRejector
];

@injectable()
export abstract class SignalRServiceBase implements IDisposable {

    protected readonly serviceOptionsFactory: () => ISignalRServiceOptions;
    protected readonly eventBus: IEventBus;
    protected readonly methods: Map<string, string>;
    protected readonly subscriptions: Map<string, string>;
    protected readonly invocations: Map<string, Map<string, any>>;
    protected hubConnection?: signalR.HubConnection;

    protected abstract get hubName(): string;
    protected afterSubscribe(hubConnection: signalR.HubConnection): void { }
    protected beforeUnsubscribe(hubConnection: signalR.HubConnection): void { }
    protected onDispose() { }

    public constructor(
        @inject(TYPES_BALLAST.IEventBus) eventBus: IEventBus,
        @inject(TYPES_BALLAST.ISignalRServiceOptionsFactory)serviceOptionsFactory: () => ISignalRServiceOptions) {
        this.eventBus = eventBus;
        this.serviceOptionsFactory = serviceOptionsFactory;
        this.methods = new Map<string, string>();
        this.subscriptions = new Map<string, string>();
        this.invocations = new Map<string, Map<string, any>>();
    }

    public dispose() {
        if (this.hubConnection) {
            this.disconnectAsync(); // Fire and forget
        }
        this.onDispose();
    }

    public get isConnected() {
        return (!!this.hubConnection);
    }

    public createHubConnection() {
        let options = this.serviceOptionsFactory();
        let hubName = this.hubName;
        let hub = `${options.serverUrl}/${hubName}`;
        let connectionOptions: signalR.IHubConnectionOptions = {};
        let connection = new signalR.HubConnection(hub, connectionOptions);
        return connection;
    }

    public async connectAsync() {
        if (this.isConnected || this.hubConnection) {
            await this.disconnectAsync();
        }
        this.hubConnection = this.createHubConnection();
        this.resubscribeToHubEvents();
        await this.hubConnection.start();
    }

    public async disconnectAsync() {
        if (this.isConnected || this.hubConnection) {
            this.unsubscribeFromHubEvents();
            await (<signalR.HubConnection>this.hubConnection).stop();
        }
        this.hubConnection = undefined;
    }

    protected registerHubMethod(method: string) {
        this.methods.set(method, method);
        this.registerCallbackForHubMethod(method);
    }

    private registerCallbackForHubMethod(methodName: string) {
        // Do not proceed unless are have a hub connection
        if (!this.hubConnection) {
            return;
        }
        // Register fulfillment (callback) subscription for the current method
        let callback = `${methodName}Callback`;
        this.subscriptions.set(callback, callback);
        this.hubConnection.on(callback, (invocationId: string, reason?: null | string, value?: null | any) => {
            // Get the list of all currently running/live method invocations
            let currentInvocations = this.getInvocationList(methodName);
            let foundInvocation = currentInvocations.get(invocationId);
            if (!foundInvocation) {
                return;
            }
            let resolve = foundInvocation["0"] as SignalRServiceInvocationResolver<any>;
            let reject = foundInvocation["1"] as SignalRServiceInvocationRejector;
            if (!!reason) {
                // Reject the promise
                reject(reason);
            } else {
                // Resolve the promise
                resolve(value || undefined);
            }
            // Remove from the list of invocations (promise has reached fulfilled state)
            currentInvocations.delete(invocationId);
        });
    }

    protected resubscribeToHubEvents() {
        // Unsubscribe from all (if already subscribed)
        this.unsubscribeFromHubEvents();
        // Make sure we have a hub connection instance
        if (!this.isConnected) {
            throw new Error('Cannot (re)subscribe to hub events without a hub connection');
        }
        // Iterate through registered hub methods
        this.methods.forEach(methodName => this.registerCallbackForHubMethod(methodName));
        if (this.isConnected) {
            this.afterSubscribe(<signalR.HubConnection>this.hubConnection);
        }
    }

    protected unsubscribeFromHubEvents() {
        if (this.isConnected) {
            this.beforeUnsubscribe(<signalR.HubConnection>this.hubConnection);
            let subscriptions = Array.from(this.subscriptions.keys());
            for (let subscription of subscriptions) {
                (<signalR.HubConnection>this.hubConnection).off(subscription);
            }
        }
        this.subscriptions.clear();
    }

    protected createInvocationId() {
        return uuid();
    }

    protected getInvocationList(method: string) {
        if (!this.invocations.has(method)) {
            this.invocations.set(method, new Map());
        }
        return (<Map<string, any>>this.invocations.get(method));
    }

    protected async createInvocationAsync<TValue extends any>(method: string, ...args: any[]) {
        if (!this.methods.has(method)) {
            this.registerHubMethod(method);
        }
        return await new Promise<TValue>((resolve, reject) => {
            let invocationList = this.getInvocationList(method);
            let invocationId = this.createInvocationId();
            invocationList.set(invocationId, [resolve, reject]);
            this.invokeOnHubAsync(method, invocationId, ...args); // Fire and forget
        });
    }

    private async invokeOnHubAsync(method: string, invocationId: string, ...args: any[]) {
        if (!this.isConnected) {
            await this.connectAsync()
        }
        if (this.isConnected) {
            let invocationIdPlusArgs = (<any[]>[invocationId]).concat(args);
            await (<signalR.HubConnection>this.hubConnection).invoke(method, ...invocationIdPlusArgs);
        }
    }

}