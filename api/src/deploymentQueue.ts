// src/deploymentQueue.ts

// --- In-Memory Deployment Queue and Worker ---
// This queue stores functions (tasks) to be executed asynchronously
const deploymentQueue: Array<() => Promise<void>> = [];
// Increased limit as requested by the user in the prompt
const MAX_CONCURRENT_DEPLOYMENTS = 1; // Limit of concurrent deployments
let runningDeployments = 0; // Counter for currently running deployments

console.log(`In-memory deployment queue initialized. Max concurrent deployments: ${MAX_CONCURRENT_DEPLOYMENTS}`);

// The worker function that pulls tasks from the queue and executes them
async function deploymentWorker() {
    // Continue processing as long as there are tasks in the queue AND we are below the concurrency limit
    while (deploymentQueue.length > 0 && runningDeployments < MAX_CONCURRENT_DEPLOYMENTS) {
        const task = deploymentQueue.shift(); // Get the next task from the front of the queue
        if (task) { // Ensure a task was actually retrieved
            runningDeployments++;
            console.log(`[Worker] Starting a deployment task. Running: ${runningDeployments}/${MAX_CONCURRENT_DEPLOYMENTS}. Queue size: ${deploymentQueue.length}`);
            try {
                await task(); // Execute the task (which is an async function calling processDeployment)
            } catch (error) {
                // This catch block is primarily for logging errors that might escape
                // the internal error handling of the task itself (processDeployment).
                // The processDeployment function's internal catch should handle updating DB status.
                console.error("[Worker] Unhandled error executing deployment task:", error);
            } finally {
                runningDeployments--;
                console.log(`[Worker] Finished a deployment task. Running: ${runningDeployments}/${MAX_CONCURRENT_DEPLOYMENTS}. Queue size: ${deploymentQueue.length}`);
                // Schedule the worker to check the queue again immediately after a task finishes.
                // This is crucial to pick up the next queued task if concurrency allows.
                // Using setImmediate or process.nextTick prevents blocking the event loop.
                setImmediate(deploymentWorker);
            }
        }
    }
    // If the loop finishes, it means the queue is empty or the concurrency limit is reached.
    console.log(`[Worker] Queue empty or concurrency limit reached. Worker pausing.`);
}

/**
 * Adds a new deployment task to the in-memory queue.
 * The task will be picked up by the deployment worker when concurrency allows.
 * @param task An async function representing the deployment task (e.g., a function that calls processDeployment with specific parameters).
 */
function enqueueDeployment(task: () => Promise<void>) {
    deploymentQueue.push(task);
    console.log(`[Queue] Task added to queue. Queue size: ${deploymentQueue.length}`);
    // Start the worker if it's not currently running at maximum capacity.
    // This ensures the worker starts processing if there's a new task and a slot is free.
    if (runningDeployments < MAX_CONCURRENT_DEPLOYMENTS) {
        console.log(`[Queue] Concurrency available, scheduling worker to check queue.`);
        setImmediate(deploymentWorker); // Schedule the worker to run soon
    } else {
        console.log(`[Queue] Concurrency limit reached. Task queued, worker will pick it up when a slot is free.`);
    }
}
// --- End In-Memory Deployment Queue and Worker ---

export { enqueueDeployment };
