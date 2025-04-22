// This interface defines the shape of the API exposed by the Roo Code extension.
// We define only the methods we intend to use in the bridge extension.
// Keep this synchronized with the actual API in Roo Code's src/exports/api.ts
export interface RooCodeAPI {
    startNewTask(options: {
        configuration?: any; // Use 'any' for simplicity, or define RooCodeSettings if needed
        text?: string;
        images?: string[];
        newTab?: boolean;
    }): Promise<string>; // Returns taskId

    sendMessage(text?: string, images?: string[]): Promise<void>;

    cancelTask(taskId: string): Promise<void>;

    cancelCurrentTask(): Promise<void>;

    // Add other methods from Roo Code's API if needed, for example:
    // resumeTask(taskId: string): Promise<void>;
    // getConfiguration(): any;
    // setConfiguration(values: any): Promise<void>;
    // isReady(): boolean;
    // on(event: string, listener: (...args: any[]) => void): this; // For event handling if needed

    // --- Event Emitter Methods (from NodeJS EventEmitter) ---
    // Define specific event signatures used in extension.ts for better type safety

    // Listener for Roo's messages
    on(event: 'message', listener: (payload: {
        taskId: string;
        message: { // Structure based on ClineMessage assumption
            message: string;
            role: 'user' | 'assistant' | 'system' | 'tool';
            partial?: boolean;
            // Potentially other fields like isComplete?
        };
    }) => void): this;

    // Listener for task completion
    on(event: 'taskCompleted', listener: (taskId: string, usage: any) => void): this; // Define usage type more strictly if known

    // Listener for task abortion
    on(event: 'taskAborted', listener: (taskId: string) => void): this;

    // Generic fallback for other events or if specific signatures are not needed
    on(event: string | symbol, listener: (...args: any[]) => void): this;

    // Add other EventEmitter methods if needed (e.g., off, once, emit)
    // off(event: string | symbol, listener: (...args: any[]) => void): this;
}