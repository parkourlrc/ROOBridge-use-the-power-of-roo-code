# Roo Code Bridge

Provides an HTTP interface to control the Roo Code (`RooVeterinaryInc.roo-cline`) VS Code extension.

## Core Functionality

This extension acts as a bridge, running a local HTTP server that allows external applications to interact with the Roo Code extension programmatically.

### HTTP API (Listens on Port 3005 by default)

The bridge exposes the following endpoints:

*   **`POST /start_task`**: Starts a new Roo Code task.
    *   **Request Body:**
        ```json
        {
          "text": "Your prompt text",
          "images": ["base64_encoded_image_string"], // Optional array of images
          "configuration": {}, // Optional Roo Code configuration overrides
          "newTab": false, // Optional: whether to force a new Roo tab
          "callbackUrl": "http://your-server.com/roo-callback" // Optional URL for completion notification
        }
        ```
    *   **Success Response (200 OK):**
        ```json
        {
          "message": "Task started successfully",
          "taskId": "generated-task-id"
        }
        ```
    *   **Error Responses:** `400 Bad Request`, `500 Internal Server Error`, `503 Service Unavailable` (if Roo Code API is not ready).

*   **`POST /send_message`**: Sends a follow-up message to the currently active Roo Code task.
    *   **Request Body:**
        ```json
        {
          "text": "Your follow-up message",
          "images": ["base64_encoded_image_string"] // Optional array of images
        }
        ```
    *   **Success Response (200 OK):**
        ```json
        {
          "message": "Message sent successfully"
        }
        ```
    *   **Error Responses:** `400 Bad Request`, `500 Internal Server Error`, `503 Service Unavailable`.

*   **`POST /cancel_task`**: Cancels a specific Roo Code task by its ID.
    *   **Request Body:**
        ```json
        {
          "taskId": "task-id-to-cancel"
        }
        ```
    *   **Success Response (200 OK):**
        ```json
        {
          "message": "Task cancelled successfully",
          "taskId": "task-id-to-cancel"
        }
        ```
    *   **Error Responses:** `400 Bad Request`, `500 Internal Server Error`, `503 Service Unavailable`.

*   **`POST /cancel_current_task`**: Cancels the currently active Roo Code task.
    *   **Request Body:** `{}` (Empty)
    *   **Success Response (200 OK):**
        ```json
        {
          "message": "Current task cancelled successfully"
        }
        ```
    *   **Error Responses:** `500 Internal Server Error`, `503 Service Unavailable`.

*   **`GET /health`**: Checks the health status of the bridge service.
    *   **Success Response (200 OK):**
        ```json
        {
          "status": "OK",
          "rooApiAvailable": true // Indicates if the bridge can communicate with the Roo Code extension API
        }
        ```

### Callback Mechanism

If you provide a `callbackUrl` when calling `/start_task`, the bridge will send a `POST` request to that URL when the corresponding task completes successfully.

*   **Callback Request Body:**
    ```json
    {
      "taskId": "completed-task-id",
      "isComplete": true,
      "usage": { ... } // Object containing token usage details provided by Roo Code
    }
    ```

## Dependencies

*   **Requires the `RooVeterinaryInc.roo-cline` VS Code extension.** This bridge extension will not function without it. Please ensure the Roo Code extension is installed and enabled in VS Code before activating this bridge.

## Installation and Running

### From Source (Development)

1.  Clone this repository.
2.  Navigate to the project directory in your terminal.
3.  Run `npm install` to install dependencies.
4.  Run `npm run compile` to build the extension, or `npm run watch` to build and watch for changes.
5.  Open the project folder in VS Code (`code .`).
6.  Press `F5` to start a new VS Code Extension Development Host window with the bridge extension running. The bridge server will attempt to start automatically.

### From VSIX File

1.  Download the `.vsix` file (e.g., `roo-bridge-extension-x.y.z.vsix`).
2.  Open VS Code.
3.  Go to the Extensions view (Ctrl+Shift+X).
4.  Click the "..." menu in the top-right corner of the Extensions view.
5.  Select "Install from VSIX..." and choose the downloaded `.vsix` file.
6.  Reload VS Code when prompted. The bridge server should start automatically upon activation.

## Configuration

*   **HTTP Port:** The bridge server listens on port `3005` by default. (Defined in `src/extension.ts`)
*   **Log File:** Debug logs are written to `C:/Users/Admin/Desktop/roo-bridge-debug.log`. (Defined in `src/extension.ts`) *Note: This path is currently hardcoded.*

## Development Scripts

The following npm scripts are available for development:

*   `npm run compile`: Compiles the TypeScript code to JavaScript (output in `./out`).
*   `npm run watch`: Compiles the code and watches for file changes, recompiling automatically.
*   `npm run lint`: Runs ESLint to check the code for style and potential errors.

## API Call Flow Example (`/start_task` with Callback)

```mermaid
sequenceDiagram
    participant Client as HTTP Client
    participant Bridge as Roo Code Bridge (Port 3005)
    participant RooCode as Roo Code Extension
    participant CallbackServer as Callback Server

    Client->>+Bridge: POST /start_task (with callbackUrl)
    Bridge->>+RooCode: startNewTask()
    RooCode-->>-Bridge: taskId
    Bridge-->>-Client: 200 OK { taskId }

    Note over RooCode: Task Processing...

    RooCode->>+Bridge: Emit 'taskCompleted' (taskId, usage)
    Bridge->>+CallbackServer: POST callbackUrl { taskId, isComplete: true, usage }
    CallbackServer-->>-Bridge: 200 OK
    Bridge-->>-RooCode: Ack (Implicit)
