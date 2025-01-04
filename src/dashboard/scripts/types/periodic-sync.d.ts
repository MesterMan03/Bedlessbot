interface PeriodicSyncRegistration extends SyncRegistration {
    minInterval: number;
}

interface ServiceWorkerRegistration {
    periodicSync: PeriodicSyncManager;
}

interface PeriodicSyncManager {
    register(tag: string, options: { minInterval: number }): Promise<void>;
    getTags(): Promise<string[]>;
    unregister(tag: string): Promise<void>;
}

// Extend ServiceWorkerGlobalScopeEventMap to include periodic sync related events
interface ServiceWorkerGlobalScopeEventMap extends WorkerGlobalScopeEventMap {
    periodicsync: PeriodicSyncEvent; // Add this line for periodic sync event
}

// Define PeriodicSyncEvent interface if needed
interface PeriodicSyncEvent extends Event {
    readonly tag: string;
    readonly lastTriggered: number | null;
}
