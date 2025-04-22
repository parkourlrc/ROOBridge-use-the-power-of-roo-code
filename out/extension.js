"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const http = __importStar(require("http"));
const https = __importStar(require("https")); // Import https for making requests
const url_1 = require("url"); // Import URL for parsing callback URLs
const express_1 = __importDefault(require("express"));
const fs = __importStar(require("fs")); // Import fs for file logging
const util_1 = require("util"); // Import inspect for better object logging
// --- File Logging Setup ---
// Use an absolute path for debugging, ensure this path is writable by VS Code
const logFilePath = 'C:/Users/Admin/Desktop/roo-bridge-debug.log'; // Log file directly on Desktop
// Ensure log file exists and clear it on activation (optional, good for clean test runs)
try {
    fs.writeFileSync(logFilePath, `Log initialized at ${new Date().toISOString()}\n`, { encoding: 'utf-8' });
}
catch (err) {
    // Log initial error to console if file system access fails
    console.error(`Roo Bridge: Failed to initialize log file at ${logFilePath}:`, err);
    // Attempt to show error message in VS Code UI as well
    vscode.window.showErrorMessage(`Roo Bridge: Failed to initialize log file at ${logFilePath}. Check permissions or path. Error: ${err.message}`);
}
// Simplified logToFile, primarily for non-event logging now
function logToFile(message) {
    try {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFilePath, `${timestamp} - ${message}\n`, { encoding: 'utf-8' });
    }
    catch (err) {
        console.error(`Roo Bridge: Failed to write to log file (${logFilePath}):`, err); // Fallback to console if logging fails
    }
}
// Helper to log directly to file, bypassing potential issues in logToFile for objects
function logObjectToFile(prefix, obj) {
    try {
        const timestamp = new Date().toISOString();
        let logString;
        try {
            // Use inspect for better details than JSON.stringify for complex objects/errors
            logString = (0, util_1.inspect)(obj, { depth: 5 }); // Limit depth slightly
        }
        catch (e) {
            logString = `[Error inspecting object: ${e.message}]`;
        }
        fs.appendFileSync(logFilePath, `${timestamp} - ${prefix}: ${logString}\n`, { encoding: 'utf-8' });
    }
    catch (err) {
        console.error(`Roo Bridge: Failed to write object to log file (${logFilePath}):`, err);
    }
}
// --- End File Logging Setup ---
// --- Configuration ---
const HTTP_PORT = 3005; // Port for the bridge server to listen on
const ROO_CODE_EXTENSION_ID = 'RooVeterinaryInc.roo-cline';
let rooApi = undefined;
let server = undefined;
// Use a Map for potentially better handling, though the core issue might be instance separation
const taskCallbacks = new Map();
// --- Helper Function to Send Callback ---
async function sendCallback(callbackUrl, data) {
    logToFile(`Attempting to send callback to: ${callbackUrl} with data: ${JSON.stringify(data)}`);
    try {
        const url = new url_1.URL(callbackUrl);
        const postData = JSON.stringify(data);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search, // Include path and query params if any
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
            timeout: 10000 // Add a timeout (10 seconds)
        };
        const client = url.protocol === 'https:' ? https : http;
        return new Promise((resolve, reject) => {
            const req = client.request(options, (res) => {
                let responseBody = '';
                res.on('data', (chunk) => {
                    responseBody += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        logToFile(`Callback successful (Status: ${res.statusCode}): ${responseBody}`);
                        resolve();
                    }
                    else {
                        logToFile(`Callback failed (Status: ${res.statusCode}): ${responseBody}`);
                        reject(new Error(`Callback failed with status ${res.statusCode}`));
                    }
                });
            });
            req.on('error', (e) => {
                logToFile(`ERROR sending callback request: ${e.message}`);
                reject(e);
            });
            req.on('timeout', () => {
                req.destroy(); // Destroy the request on timeout
                logToFile(`ERROR sending callback request: Timeout after ${options.timeout}ms`);
                reject(new Error('Callback request timed out'));
            });
            // Write data to request body
            req.write(postData);
            req.end();
        });
    }
    catch (error) {
        logToFile(`ERROR in sendCallback function for ${callbackUrl}: ${error.message}\nSTACK: ${error.stack}`);
        // Decide if we should retry or just log
        throw error; // Re-throw error so the caller knows it failed
    }
}
async function activate(context) {
    logToFile('Activating Roo Bridge Extension...');
    try { // Wrap main activation logic
        // Get the Roo Code extension
        logToFile(`Attempting to get Roo Code extension: ${ROO_CODE_EXTENSION_ID}`);
        const rooCodeExtension = vscode.extensions.getExtension(ROO_CODE_EXTENSION_ID);
        if (!rooCodeExtension) {
            const errorMsg = 'Roo Code extension not found. Please ensure it is installed and enabled.';
            logToFile(`ERROR: ${errorMsg}`);
            vscode.window.showErrorMessage(errorMsg);
            return;
        }
        logToFile('Roo Code extension found.');
        // Activate Roo Code if it's not already active and get its API
        try { // Wrap API acquisition
            if (!rooCodeExtension.isActive) {
                logToFile('Roo Code extension is not active, activating...');
                rooApi = await rooCodeExtension.activate();
                logToFile('Roo Code extension activated via activate().');
            }
            else {
                rooApi = rooCodeExtension.exports;
                logToFile('Roo Code extension already active, using exports.');
            }
            if (!rooApi) {
                throw new Error('Could not get Roo Code API (returned undefined).');
            }
            logToFile(`Successfully obtained Roo Code API. Type: ${typeof rooApi}`);
        }
        catch (apiError) {
            logToFile(`ERROR acquiring Roo Code API: ${apiError.message}\nSTACK: ${apiError.stack}`);
            vscode.window.showErrorMessage(`Roo Bridge: Failed to get Roo Code API: ${apiError.message}`);
            rooApi = undefined; // Ensure API is undefined on error
            // Do not proceed if API acquisition fails
            return;
        }
        // --- Start HTTP Server ---
        logToFile('Setting up Express app...');
        const app = (0, express_1.default)();
        app.use(express_1.default.json()); // Middleware to parse JSON bodies
        // --- API Endpoints ---
        logToFile('Defining API endpoints...');
        // Endpoint to start a new task
        app.post('/start_task', async (req, res) => {
            logToFile(`Received POST /start_task request. Body keys: ${Object.keys(req.body).join(', ')}`);
            if (!rooApi) {
                logToFile('ERROR /start_task: Roo Code API not available');
                return res.status(503).json({ error: 'Roo Code API not available' });
            }
            try {
                const { text, images, configuration, newTab, callbackUrl } = req.body; // Added callbackUrl
                logToFile(`  /start_task details: text=${!!text}, images=${!!images}, newTab=${newTab}, callbackUrl=${callbackUrl}`);
                // Basic validation
                if (typeof text !== 'string' && !Array.isArray(images)) {
                    logToFile('ERROR /start_task: Missing text or images');
                    return res.status(400).json({ error: 'Missing "text" (string) or "images" (array) in request body' });
                }
                // Validate callbackUrl format (basic check)
                if (callbackUrl && typeof callbackUrl !== 'string') {
                    logToFile('ERROR /start_task: Invalid callbackUrl');
                    return res.status(400).json({ error: 'Invalid "callbackUrl" provided, must be a string' });
                }
                logToFile('Calling rooApi.startNewTask...');
                // IMPORTANT: Assuming rooApi.startNewTask does NOT need callbackUrl
                const taskId = await rooApi.startNewTask({ text, images, configuration, newTab });
                logToFile(`Roo Code started new task with ID: ${taskId}`);
                // Store the callback URL if provided
                if (callbackUrl && taskId) {
                    taskCallbacks.set(taskId, callbackUrl); // Use Map.set
                    logToFile(`Stored callback URL for task ${taskId}: ${callbackUrl}`);
                    logToFile(`Current taskCallbacks size: ${taskCallbacks.size}`); // Log size after adding
                }
                res.status(200).json({ message: 'Task started successfully', taskId });
                logToFile(`Responded 200 OK to /start_task for task ${taskId}`);
            }
            catch (error) {
                logToFile(`ERROR calling rooApi.startNewTask: ${error.message}\nSTACK: ${error.stack}`);
                res.status(500).json({ error: 'Failed to start Roo Code task', details: error.message });
            }
        });
        // Endpoint to send a message to the current task
        app.post('/send_message', async (req, res) => {
            logToFile(`Received POST /send_message request. Body keys: ${Object.keys(req.body).join(', ')}`);
            if (!rooApi) {
                logToFile('ERROR /send_message: Roo Code API not available');
                return res.status(503).json({ error: 'Roo Code API not available' });
            }
            try {
                const { text, images } = req.body;
                logToFile(`  /send_message details: text=${!!text}, images=${!!images}`);
                // Basic validation
                if (typeof text !== 'string' && !Array.isArray(images)) {
                    logToFile('ERROR /send_message: Missing text or images');
                    return res.status(400).json({ error: 'Missing "text" (string) or "images" (array) in request body' });
                }
                logToFile('Calling rooApi.sendMessage...');
                await rooApi.sendMessage(text, images); // Assumes sendMessage targets the active task
                logToFile(`Sent message to Roo Code active task.`);
                res.status(200).json({ message: 'Message sent successfully' });
                logToFile(`Responded 200 OK to /send_message`);
            }
            catch (error) {
                logToFile(`ERROR calling rooApi.sendMessage: ${error.message}\nSTACK: ${error.stack}`);
                res.status(500).json({ error: 'Failed to send message to Roo Code task', details: error.message });
            }
        });
        // Endpoint to cancel a specific task by ID
        app.post('/cancel_task', async (req, res) => {
            logToFile(`Received POST /cancel_task request. Body keys: ${Object.keys(req.body).join(', ')}`);
            if (!rooApi) {
                logToFile('ERROR /cancel_task: Roo Code API not available');
                return res.status(503).json({ error: 'Roo Code API not available' });
            }
            try {
                const { taskId } = req.body;
                logToFile(`  /cancel_task details: taskId=${taskId}`);
                if (typeof taskId !== 'string' || !taskId) {
                    logToFile('ERROR /cancel_task: Missing taskId');
                    return res.status(400).json({ error: 'Missing "taskId" (string) in request body' });
                }
                logToFile(`Calling rooApi.cancelTask for ID: ${taskId}`);
                await rooApi.cancelTask(taskId); // This should trigger the 'taskAborted' event listener below
                logToFile(`Cancelled Roo Code task with ID: ${taskId}`);
                // Callback cleanup now happens in the 'taskAborted' listener
                res.status(200).json({ message: 'Task cancelled successfully', taskId });
                logToFile(`Responded 200 OK to /cancel_task for task ${taskId}`);
            }
            catch (error) {
                logToFile(`ERROR calling rooApi.cancelTask: ${error.message}\nSTACK: ${error.stack}`);
                res.status(500).json({ error: 'Failed to cancel Roo Code task', details: error.message });
            }
        });
        // Endpoint to cancel the current active task
        app.post('/cancel_current_task', async (req, res) => {
            logToFile(`Received POST /cancel_current_task request.`);
            if (!rooApi) {
                logToFile('ERROR /cancel_current_task: Roo Code API not available');
                return res.status(503).json({ error: 'Roo Code API not available' });
            }
            try {
                logToFile('Calling rooApi.cancelCurrentTask...');
                await rooApi.cancelCurrentTask(); // This should trigger 'taskAborted' for the active task
                logToFile(`Cancelled current active Roo Code task.`);
                // Note: We don't know the current task ID here, cleanup happens in listener
                res.status(200).json({ message: 'Current task cancelled successfully' });
                logToFile(`Responded 200 OK to /cancel_current_task`);
            }
            catch (error) {
                logToFile(`ERROR calling rooApi.cancelCurrentTask: ${error.message}\nSTACK: ${error.stack}`);
                res.status(500).json({ error: 'Failed to cancel current Roo Code task', details: error.message });
            }
        });
        // Basic health check endpoint
        app.get('/health', (req, res) => {
            logToFile('Received GET /health request.');
            res.status(200).json({ status: 'OK', rooApiAvailable: !!rooApi });
            logToFile('Responded 200 OK to /health.');
        });
        logToFile('Starting HTTP server...');
        server = http.createServer(app);
        // Add error handling for server startup
        server.on('error', (error) => {
            logToFile(`ERROR: HTTP Server Error: ${error.message}\nSTACK: ${error.stack}`);
            vscode.window.showErrorMessage(`Roo Bridge server failed to start: ${error.message}`);
            server = undefined; // Reset server variable on error
        });
        server.listen(HTTP_PORT, () => {
            logToFile(`Roo Bridge HTTP server listening on port ${HTTP_PORT}`);
            vscode.window.showInformationMessage(`Roo Bridge server started on port ${HTTP_PORT}`);
        });
        // --- Subscribe to Roo Code Replies (Using actual API info) ---
        logToFile('Attempting to subscribe to Roo Code events...');
        if (rooApi && typeof rooApi.on === 'function') {
            try { // Wrap event subscription
                logToFile("Subscribing to Roo Code 'message' event...");
                // Use the correct event name 'message' (corresponding to RooCodeEventName.Message)
                rooApi.on('message', async (data) => {
                    logObjectToFile("Received 'message' event data", data); // Log the entire data object using helper
                    // --- REMOVED CALLBACK LOGIC FROM HERE ---
                    // We no longer send callbacks on every message.
                    // The logic is moved to the 'taskCompleted' listener.
                    logToFile(`Ignoring 'message' event for callback purposes.`);
                });
                // Also listen for task completion/abortion to clean up callbacks
                logToFile("Subscribing to Roo Code 'taskCompleted' event...");
                rooApi.on('taskCompleted', async (taskId, usage) => {
                    logToFile(`Task ${taskId} completed.`);
                    logObjectToFile("Task completed usage data", usage); // Log usage data
                    // --- ADDED CALLBACK LOGIC HERE ---
                    const callbackUrl = taskCallbacks.get(taskId);
                    if (callbackUrl) {
                        logToFile(`Found callback URL for completed task ${taskId}: ${callbackUrl}`);
                        const payload = {
                            taskId: taskId,
                            isComplete: true, // Mark as complete
                            usage: usage, // Include token usage
                        };
                        try {
                            await sendCallback(callbackUrl, payload);
                            logToFile(`Successfully sent completion callback for task ${taskId}.`);
                        }
                        catch (callbackError) {
                            logToFile(`ERROR sending completion callback for task ${taskId}: ${callbackError.message}\nSTACK: ${callbackError.stack}`);
                        }
                        finally {
                            // Always remove the URL after attempting to send
                            taskCallbacks.delete(taskId);
                            logToFile(`Removed callback URL for task ${taskId} after completion attempt.`);
                            logToFile(`Current taskCallbacks size: ${taskCallbacks.size}`);
                        }
                    }
                    else {
                        logToFile(`No callback URL found for completed task ${taskId}.`);
                    }
                    // --- END CALLBACK LOGIC ---
                    // Original cleanup (kept just in case, though redundant if callback logic handles delete)
                    // if (taskCallbacks.has(taskId)) { // Use Map.has
                    //     logToFile(`Deleting callback URL for completed task ${taskId}.`);
                    //     taskCallbacks.delete(taskId); // Use Map.delete
                    //     logToFile(`Current taskCallbacks size: ${taskCallbacks.size}`); // Log size after deleting
                    // }
                });
                logToFile("Subscribing to Roo Code 'taskAborted' event...");
                rooApi.on('taskAborted', (taskId) => {
                    logToFile(`Task ${taskId} aborted. Cleaning up callback.`);
                    if (taskCallbacks.has(taskId)) { // Use Map.has
                        logToFile(`Deleting callback URL for aborted task ${taskId}.`);
                        taskCallbacks.delete(taskId); // Use Map.delete
                        logToFile(`Current taskCallbacks size: ${taskCallbacks.size}`); // Log size after deleting
                    }
                });
                logToFile("Successfully subscribed to Roo Code 'message', 'taskCompleted', and 'taskAborted' events.");
            }
            catch (subscribeError) {
                logToFile(`ERROR subscribing to Roo Code events: ${subscribeError.message}\nSTACK: ${subscribeError.stack}`);
                vscode.window.showWarningMessage("Roo Bridge: Error subscribing to Roo Code events. Callback functionality may fail.");
            }
        }
        else {
            const reason = !rooApi ? "rooApi is undefined" : "'on' method not found on rooApi";
            logToFile(`WARN: Could not subscribe to Roo Code events (${reason}). Callback functionality will not work.`);
            vscode.window.showWarningMessage(`Roo Bridge: Could not subscribe to Roo Code events (${reason}). Callback functionality disabled.`);
        }
        // --- End Subscription ---
        // Add server close to context subscriptions for cleanup
        context.subscriptions.push({
            dispose: () => {
                logToFile('Disposing Roo Bridge extension...');
                // Clear callbacks on disposal
                taskCallbacks.clear(); // Use Map.clear
                logToFile('Cleared task callbacks.');
                server?.close(() => {
                    logToFile('Roo Bridge HTTP server stopped.');
                });
            }
        });
        logToFile('Roo Bridge Extension activation finished successfully.');
    }
    catch (mainActivateError) {
        logToFile(`FATAL ERROR during Roo Bridge activation: ${mainActivateError.message}\nSTACK: ${mainActivateError.stack}`);
        vscode.window.showErrorMessage(`Failed to activate Roo Bridge: ${mainActivateError.message}`);
        // Ensure API is undefined if activation fails critically
        rooApi = undefined;
    }
}
function deactivate() {
    logToFile('Deactivating Roo Bridge Extension...');
    server?.close(() => {
        logToFile('Roo Bridge HTTP server stopped during deactivation.');
    });
    rooApi = undefined;
    server = undefined;
    // Clear callbacks just in case dispose wasn't called properly
    taskCallbacks.clear(); // Use Map.clear
    logToFile('Roo Bridge Extension deactivated.');
}
//# sourceMappingURL=extension.js.map