import * as net from 'net';
import path from 'path';
import pm2 from 'pm2';
import fs from 'fs/promises'; // Using fs/promises for async file checks

// Define a port range for deployments
const DEPLOYMENT_PORT_RANGE_START = 4001;
const DEPLOYMENT_PORT_RANGE_END = 4999;

/**
 * Finds an available port within the defined range by attempting to listen on it.
 * @param startPort The starting port to check.
 * @param endPort The ending port to check.
 * @returns A promise that resolves with a free port number.
 * @throws Error if no free ports are found in the range.
 */
async function findFreePort(startPort: number, endPort: number): Promise<number> {
    console.log(`[Serving Service] Finding free port between ${startPort} and ${endPort}`);
    for (let port = startPort; port <= endPort; port++) {
        const isPortFree = await new Promise<boolean>((resolve) => {
            const server = net.createServer();
            server.once('error', (err: any) => {
                server.close(); // Ensure server is closed on error
                if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
                    resolve(false); // Port is in use or not accessible
                } else {
                    // Log unexpected errors but treat port as not free
                    console.warn(`[Serving Service] Unexpected error checking port ${port}: ${err.message}`);
                    resolve(false);
                }
            });
            server.once('listening', () => {
                server.close(() => resolve(true)); // Port is free, close server then resolve
            });

            // Timeout for the port check
            const timeout = setTimeout(() => {
                server.close(); // Close the server if it takes too long
                console.warn(`[Serving Service] Timeout checking port ${port}`);
                resolve(false); // Consider the port not free on timeout
            }, 250); // Increased timeout slightly

            server.once('close', () => {
                clearTimeout(timeout); // Clear the timeout if the server closes
            });

            server.listen({ port: port, host: '127.0.0.1' }); // Listen only on localhost for the check
        });

        if (isPortFree) {
            console.log(`[Serving Service] Found free port: ${port}`);
            return port; // Return the first free port found
        }
    }
    // If the loop completes without finding a free port, throw an error
    throw new Error(`[Serving Service] No free ports found in range ${startPort}-${endPort}`);
}

/**
 * Starts the Next.js application process using PM2.
 * Adapts the start command based on the Next.js build type ('standalone' or 'classic').
 * @param buildOutputPath The path to the extracted build artifacts.
 * @param port The internal port the application should listen on.
 * @param deploymentId The ID of the deployment for naming the PM2 process.
 * @param buildType Indicates if it's a 'standalone' or 'classic' Next.js build.
 * @returns A promise that resolves when PM2 has successfully started the process.
 * @throws Error if PM2 fails to start the process or prerequisites are missing.
 */
async function startApplicationWithPm2(
    buildOutputPath: string,
    port: number,
    deploymentId: number,
    buildType: 'standalone' | 'classic'
): Promise<void> {
    const processName = `deploy-${deploymentId}`; // PM2 process name
    let scriptToRun: string; // The command or script PM2 will execute
    let pm2Args: string[] | undefined; // Arguments for the script, if any

    console.log(`[Serving Service] Preparing to start application for deployment ${deploymentId} (type: ${buildType}) using PM2.`);

    if (buildType === 'standalone') {
        scriptToRun = path.join(buildOutputPath, 'server.js'); // Standard entry for Next.js standalone
        try {
            await fs.access(scriptToRun, fs.constants.F_OK); // Check if server.js exists
            console.log(`[Serving Service] Standalone entry point '${scriptToRun}' found.`);
        } catch (error) {
            console.error(`[Serving Service] Standalone entry point 'server.js' not found at: ${scriptToRun}`);
            throw new Error(`Application entry point 'server.js' not found at expected path for standalone build: ${scriptToRun}`);
        }
    } else { // 'classic' build type
        // For classic 'next start', PM2 executes 'next' (or a path to it) with 'start' as an argument.
        // Prerequisites: package.json and .next folder must exist in buildOutputPath.
        scriptToRun = 'node_modules/.bin/next'; // Path to 'next' executable within node_modules
        pm2Args = ['start'];                  // Argument for the 'next' command

        const packageJsonPath = path.join(buildOutputPath, 'package.json');
        const dotNextPath = path.join(buildOutputPath, '.next');
        try {
            await fs.access(packageJsonPath, fs.constants.F_OK); // Check for package.json
            await fs.access(dotNextPath, fs.constants.F_OK);     // Check for .next directory
            console.log(`[Serving Service] Prerequisites for 'next start' (package.json, .next folder) found in '${buildOutputPath}'.`);
            console.log(`[Serving Service] PM2 will run: script='${scriptToRun}', args='${pm2Args.join(' ')}'`);
        } catch (error: any) {
            console.error(`[Serving Service] Required files for 'next start' (package.json or .next folder) not found in '${buildOutputPath}': ${error.message}`);
            throw new Error(`Classic Next.js build output is incomplete in '${buildOutputPath}'. Cannot find package.json or .next folder.`);
        }
    }

    // Configuration for PM2 start
    const pm2Config: pm2.StartOptions = {
        script: scriptToRun,
        args: pm2Args, // Arguments for the script (e.g., 'start' for 'next')
        name: processName,
        cwd: buildOutputPath, // Set working directory for the PM2 process
        env: {
            PORT: port.toString(), // Pass the assigned port as an environment variable
            NODE_ENV: 'production', // Ensure production environment for Next.js
            // Add other necessary runtime environment variables here if needed
        },
        watch: false, // Do not watch files for changes in production deployments
        instances: 1, // Run a single instance of the application
        exec_mode: 'fork', // Suitable for both 'node server.js' and 'next start'
        // Optional: Log file configuration for PM2 managed logs (can be useful for debugging PM2 itself)
        // output: path.join(buildOutputPath, `../pm2-out-${deploymentId}.log`), // Log outside buildOutput
        // error: path.join(buildOutputPath, `../pm2-error-${deploymentId}.log`),
        // merge_logs: true,
        // pid: path.join(buildOutputPath, `../pm2-pid-${deploymentId}.pid`),
    };

    console.log(`[Serving Service] Connecting to PM2 daemon to start process '${processName}' on port ${port}...`);
    console.log(`[Serving Service] PM2 start configuration:`, JSON.stringify(pm2Config, null, 2));

    return new Promise<void>((resolve, reject) => {
        pm2.connect((connectErr) => {
            if (connectErr) {
                console.error('[Serving Service] Error connecting to PM2 daemon:', connectErr);
                return reject(new Error(`Failed to connect to PM2 daemon: ${connectErr.message}`));
            }
            console.log('[Serving Service] Successfully connected to PM2 daemon.');

            // It's good practice to delete any existing process with the same name before starting
            pm2.delete(processName, (deleteErr) => {
                if (deleteErr && !deleteErr.message.toLowerCase().includes("doesn't exist") && !deleteErr.message.toLowerCase().includes("not found")) {
                    // Log error if it's not "process not found"
                    console.warn(`[Serving Service] PM2 delete warning for '${processName}': ${deleteErr.message}. Proceeding with start...`);
                } else if (deleteErr) {
                    console.log(`[Serving Service] PM2 process '${processName}' not found or already deleted. Proceeding with start...`);
                } else {
                    console.log(`[Serving Service] Successfully deleted existing PM2 process '${processName}' (if any).`);
                }

                // Start the new process
                pm2.start(pm2Config, (startErr, apps) => {
                    pm2.disconnect(); // Disconnect from PM2 after the start attempt
                    if (startErr) {
                        console.error(`[Serving Service] Failed to start PM2 process '${processName}':`, startErr);
                        return reject(new Error(`Failed to start application process '${processName}' with PM2: ${startErr.message}`));
                    }
                    // @ts-ignore
                    if (!apps || apps.length === 0 || !apps[0]?.pm2_env?.status || apps[0].pm2_env.status !== 'online') {
                      // @ts-ignore
                        const appStatus = apps && apps[0]?.pm2_env?.status ? apps[0].pm2_env.status : 'unknown';
                        console.error(`[Serving Service] PM2 started process '${processName}', but it's not 'online' (status: ${appStatus}). Check PM2 logs for details.`);
                        // You might want to check `pm2 logs ${processName}` for application errors.
                        return reject(new Error(`PM2 process '${processName}' started but is not online (status: ${appStatus}). Check PM2 logs.`));
                    }
                    // @ts-ignore
                    console.log(`[Serving Service] PM2 process '${processName}' (PM2 ID: ${apps[0]?.pm_id}) started successfully and is online.`);
                    resolve();
                });
            });
        });
    });
}

/**
 * Orchestrates finding a free port and starting the application process using PM2.
 * This is the main function to be called by the deployment orchestrator.
 * @param buildOutputPath The path to the extracted build artifacts on the host.
 * @param deploymentId The ID of the deployment.
 * @param options Options including the `buildType` ('standalone' | 'classic').
 * @returns A promise resolving with an object containing the assigned `internalPort`.
 * @throws Error if finding a port or starting the PM2 process fails.
 */
export async function startApplication(
    buildOutputPath: string,
    deploymentId: number,
    options: { buildType: 'standalone' | 'classic' }
): Promise<{ internalPort: number }> {
    try {
        console.log(`[Serving Service] Starting application serving logic for deployment ${deploymentId} (type: ${options.buildType})...`);
        // 1. Find a free port for this application instance
        const port = await findFreePort(DEPLOYMENT_PORT_RANGE_START, DEPLOYMENT_PORT_RANGE_END);
        console.log(`[Serving Service] Assigned internal port ${port} for deployment ${deploymentId}.`);

        // 2. Start the application process using PM2, passing the buildType
        await startApplicationWithPm2(buildOutputPath, port, deploymentId, options.buildType);
        console.log(`[Serving Service] Application process for deployment ${deploymentId} (type: ${options.buildType}) started successfully via PM2 on port ${port}.`);

        // Return the assigned internal port
        return { internalPort: port };

    } catch (error: any) {
        console.error(`[Serving Service] Error during application serving setup for deployment ${deploymentId}:`, error.message, error.stack);
        // Ensure the error is re-thrown to be caught by the main processDeployment function
        throw new Error(`Failed during application serving setup for deployment ${deploymentId}: ${error.message}`);
    }
}
