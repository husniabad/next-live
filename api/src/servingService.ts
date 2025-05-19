
  import * as net from 'net';
  import path from 'path';
  import  pm2 from 'pm2';
  import fs from 'fs/promises';



  const DEPLOYMENT_PORT_RANGE_START = 4001;
  const DEPLOYMENT_PORT_RANGE_END = 4999;


  /**
   * Finds an available port within the defined range by attempting to listen on it.
   * @param startPort The starting port to check.
   * @param endPort The ending port to check.
   * @returns A promise that resolves with a free port number.
   * @throws Error if no free ports are found in the range.
   */

  async function findFreePort(
    startPort: number,
    endPort: number
  ): Promise<number> {
    console.log(`Finding free port between ${startPort} and ${endPort}`);
    for (let port = startPort; port <= endPort; port++) {
      const isPortFree = await new Promise<boolean>((resolve) => {
        const server = net.createServer();

        server.once('error', (err: any) => {
          server.close();
          if (err.code === 'EADDRINUSE') {
            resolve(false); // Port is in use
          } else {
            console.warn(
              `Unexpected error checking port ${port}: ${err.message}`
            );
            resolve(false);
          }
        });
        // If the server starts listening, the port is free
        server.once('listening', () => {
          server.close(); 
          resolve(true); // Port is free
        });

        // Add a timeout in case the server.listen never emits 'error' or 'listening'
        // (Though less common for EADDRINUSE)
        const timeout = setTimeout(() => {
          server.close(); // Close the server if it takes too long
          console.warn(`Timeout checking port ${port}`);
          resolve(false); // Consider the port not free
        }, 200); 

        server.once('close', () => {
          clearTimeout(timeout); // Clear the timeout if the server closes
        });

        server.listen({ port: port, host: '127.0.0.1' }); // Listen to localhost to avoid external access
      });
      if (isPortFree) {
        console.log(`Found free port: ${port}`);
        return port; // Return the first free port found
      }
      // if the port is not free, continue to the next one
    }
    // if the loop completes without finding a free port, throw an error
    throw new Error(`No free ports found in range ${startPort}-${endPort}`);
  }

  /**
   * Starts the Next.js application process using PM2.
   * @param buildOutputPath The path to the extracted build artifacts.
   * @param port The internal port the application should listen on.
   * @param deploymentId The ID of the deployment for naming the process.
   * @returns A promise that resolves when PM2 has successfully started the process.
   * @throws Error if PM2 fails to start the process.
   */

  async function startApplicationWithPm2(buildOutputPath: string, port: number, deploymentId: number): Promise<void> {
    // PM2 process name for this deployment
    const processName = `deploy-${deploymentId}`;
    const entryPoint = path.join(buildOutputPath, 'server.js'); // Path to the server.js entry point

    // Check if the entry point exists (important!)
    try {
          await fs.access(entryPoint, fs.constants.F_OK);
    } catch (error: any) { // Catch error as any if @types/node is not enough
          console.error(`Entry point not found: ${entryPoint}`);
          throw new Error(`Application entry point 'server.js' not found at expected path after extraction: ${entryPoint}`);
    }


    // Configuration for PM2 start
    const pm2Config: pm2.StartOptions = { // Use pm2.StartOptions if @types/pm2 is installed, otherwise use 'any'
        script: entryPoint, // Path to the server.js entry point
        name: processName,
        cwd: buildOutputPath, // Set working directory for the process
        env: {
            PORT: port.toString(), // Pass the assigned port as an environment variable (must be string)
            NODE_ENV: 'production', // Ensure production environment
            // TODO: Add other necessary runtime environment variables here
            // You'll need to fetch these from your database/project configuration and pass them
            // via parameters to this function and include them in this env object.
        },
        watch: false, // Do not watch files for changes in production deployments
        instances: 1, // Run a single instance of the application
        exec_mode: 'fork' as 'fork', // Use fork mode for standard Node.js apps
        // Optional: Log file configuration for PM2 managed logs
        // error_file: path.join(buildOutputPath, 'pm2_error.log'),
        // out_file: path.join(buildOutputPath, 'pm2_out.log'),
        // merge_logs: true, // Merge stdout and stderr
    };

    console.log(`Connecting to PM2 daemon to start process '${processName}' on port ${port}...`);

    return new Promise((resolve, reject) => {
        pm2?.connect((err) => {
            if (err) {
                console.error('Error connecting to PM2:', err);
                // Do NOT disconnect here, the connection might not have been established
                return reject(new Error(`Failed to connect to PM2 daemon: ${err.message}`));
            }

            console.log(`Successfully connected to PM2 daemon.`);

            pm2.start(pm2Config, (startErr, apps) => {
                // Disconnect from PM2 after the command is done (success or failure)
                // In a long-running backend service, you might manage the connection state differently.
                pm2.disconnect();

                if (startErr) {
                    console.error(`Failed to start PM2 process '${processName}':`, startErr);
                    return reject(new Error(`Failed to start application process '${processName}': ${startErr.message}`));
                }

                console.log(`PM2 process '${processName}' started successfully.`);
                // Optional: Get PM2 process ID if needed for monitoring or stopping
                // const pm2Id = apps[0].pm_id;
                // console.log(`PM2 process ID: ${pm2Id}`);
                resolve(); // Resolve the promise on successful start
            });
        });
    });
  }

  /**
   * Orchestrates finding a port and starting the application process for a deployment.
   * This is the main function to be called by the resolvers.
   * @param buildOutputPath The path to the extracted build artifacts on the host.
   * @param deploymentId The ID of the deployment.
   * @returns A promise resolving with the assigned internal port.
   * @throws Error if finding a port or starting the process fails.
   */

  async function startApplication(buildOutputPath: string, deploymentId: number): Promise<{ internalPort: number }> {
    try {
        console.log(`Starting application serving logic for deployment ${deploymentId}...`);
        // 1. Find a free port for this application instance
        const port = await findFreePort(DEPLOYMENT_PORT_RANGE_START, DEPLOYMENT_PORT_RANGE_END);
        console.log(`Assigned internal port ${port} for deployment ${deploymentId}.`);

        // 2. Start the application process using PM2
        await startApplicationWithPm2(buildOutputPath, port, deploymentId);
        console.log(`Application process started successfully for deployment ${deploymentId}.`);

        // Return the assigned port
        return { internalPort: port };

    } catch (error: any) {
        console.error(`Error during application serving setup for deployment ${deploymentId}:`, error.message);
        throw new Error(`Failed during application serving setup: ${error.message}`);
    }
  }

  export { startApplication };
