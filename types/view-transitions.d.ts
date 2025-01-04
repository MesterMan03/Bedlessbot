interface ViewTransitionEvent extends Event {
    transition: ViewTransition;
}

interface ViewTransition {
    updateCallbackDone: Promise<void>;
    ready: Promise<void>;
    finished: Promise<void>;
}

interface Document {
    startViewTransition(updateCallback: () => Promise<void> | void): ViewTransition;
}