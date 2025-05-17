// src/proxyService.ts

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises'; // Use promises version for async file operations
import { URL } from 'url'; // Import URL class
import { createWriteStream, WriteStream } from 'fs'; // Import for file streaming

// --- Configuration Constants ---
// IMPORTANT: Adjust these paths and commands based on your VPS environment!
const NGINX_SITES_AVAILABLE_DIR = '/etc/nginx/sites-available'; // Standard Nginx directory
const NGINX_SITES_ENABLED_DIR = '/etc/nginx/sites-enabled'; // Standard Nginx directory
const NGINX_RELOAD_COMMAND = 'sudo nginx -s reload'; // Command to reload Nginx config
// --- End Configuration Constants ---

/**
 * Generates the Nginx server block configuration content for a deployment.
 * @param deploymentUrl The public URL (e.g., subdomain) for the deployment (including protocol).
 * @param internalPort The internal port the application is listening on.
 * @param buildOutputPath The path to the extracted build artifacts on the VPS filesystem (used for static assets).
 * @returns The Nginx configuration string.
 */
function generateNginxConfig(
    deploymentUrl: string,
    internalPort: number,
    buildOutputPath: string
): string {
    // Use the URL class to parse the deploymentUrl and get just the hostname
    const url = new URL(deploymentUrl);
    const hostname = url.hostname; // This will be 'deploy-XX.userId.yourplatform.com'

    // --- IMPORTANT: Replace these with the actual paths to your wildcard SSL cert and key ---
    // Ensure these files exist on your VM at these locations and are readable by the 'nginx' user
    const sslCertificatePath = '/etc/nginx/ssl/*.nextlivenow.app.crt';
    const sslCertificateKeyPath = '/etc/nginx/ssl/*.nextlivenow.app.key';
    // -----------------------------------------------------------------------------------

    return `
server {
    listen 80;
    listen [::]:80;
    server_name ${hostname};

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2; # Listen on port 443 with SSL enabled
    listen [::]:443 ssl http2; # Listen on IPv6 port 443 with SSL enabled
    server_name ${hostname};

    # --- SSL Configuration ---
    ssl_certificate ${sslCertificatePath}; # Path to your wildcard certificate
    ssl_certificate_key ${sslCertificateKeyPath}; # Path to your wildcard private key
    # include snippets/ssl-params.conf; # Optional: include common SSL settings if you have this file
    ssl_protocols TLSv1.2 TLSv1.3; # Recommended SSL protocols
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384'; # Recommended ciphers
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m; # Cache SSL sessions
    ssl_session_timeout 10m;
    # ssl_stapling on; # Enable OCSP Stapling (requires resolver and DNS setup)
    # ssl_stapling_verify on;
    # resolver 8.8.8.8 8.8.4.4 valid=300s; # Google Public DNS, adjust if needed
    # resolver_timeout 5s;
    # --- End SSL Configuration ---

    location / {
        proxy_pass http://127.0.0.1:${internalPort}; # Forward to the internal application port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        # Add other standard headers for proxying
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme; # Pass the protocol (http/https)
    }

    # --- Optional: Serve static assets directly via Nginx for performance ---
    # This requires the buildOutputPath to be accessible by Nginx on the VPS filesystem.
    # It also requires ensuring the 'nginx' user has read permissions for these directories.
    # For Next.js standalone, static assets are usually in .next/static and public
    # Make sure the buildOutputPath variable passed to this function is correct!
    location /_next/static/ {
        alias ${buildOutputPath}/.next/static/; # Path to static assets in the extracted build
        expires 1y; # Cache static files for a long time
        access_log off; # Optional: reduce log noise for static files
        # Add MIME types if necessary
        # default_type application/javascript;
    }
     location /public/ {
        alias ${buildOutputPath}/public/; # Path to public assets in the extracted build
        expires 1y;
        access_log off;
     }
    # --- End Optional Static Assets ---

    # Error pages (optional)
    # error_page 500 502 503 504 /50x.html;
    # location = /50x.html {
    #     root /usr/share/nginx/html; # Or wherever your error pages are
    # }

    # Optional: Add logging format
    # access_log /var/log/nginx/${hostname}.access.log combined; # Use hostname in log file name
    # error_log /var/log/nginx/${hostname}.error.log; # Use hostname in log file name
}
`;
}

/**
 * Executes a shell command that may require sudo, capturing stdout and stderr.
 * Can optionally pipe live output to a WriteStream.
 * @param command The full command string to execute (e.g., 'sudo your_command').
 * @param logStream Optional WriteStream to pipe live output to.
 * @returns A promise that resolves if the command exits with code 0.
 * @throws Error if the command fails or the process exits with a non-zero code.
 */
async function executeShellCommand(command: string, logStream: WriteStream | null = null): Promise<void> {
    console.log(`Executing command: ${command}`);
    if (logStream) logStream.write(`Executing command: ${command}\n`);

    return new Promise((resolve, reject) => {
        const process = spawn(command, {
            shell: true, // Use the shell to handle sudo, pipes, etc.
            stdio: 'pipe', // Capture stdout and stderr
        });

        // Keep collecting stdout and stderr into buffers for the final error message
        let stdoutBuffer = '';
        let stderrBuffer = '';

        process.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
        });
        process.stderr.on('data', (data) => {
            stderrBuffer += data.toString();
        });

        // Pipe live output if logStream is provided, or pipe to console as fallback
        if (logStream) {
             // Use { end: false } because the caller manages the stream's lifecycle
             // Use { end: false } when piping to avoid closing the main log stream prematurely
             process.stdout.pipe(logStream, { end: false });
             process.stderr.pipe(logStream, { end: false });
        } else {
             // Fallback to console if no log stream
             // Corrected: pipe child process streams (Readable) to global process streams (Writable)
             process.stdout.pipe(global.process.stdout);
             process.stderr.pipe(global.process.stderr);
        }


        process.on('error', (error) => {
            const errorMsg = `Command process failed to start: ${command}. ${error.message}`;
            console.error(errorMsg);
             // Write error to log stream if available (don't need to write buffers, pipe handles it)
             if (logStream) logStream.write(`\n--- Command Process Error ---\n${errorMsg}\n`);
            reject(
                new Error(errorMsg)
            );
        });

        process.on('close', (code) => {
            console.log(`Command process exited with code ${code}: ${command}`);
             // Log exit status to the log stream if available
             if (logStream) logStream.write(`Command exited with code ${code}\n`);

            if (code === 0) {
                console.log(`Command successful.`);
                 if (logStream) logStream.write(`Command successful.\n`);
                resolve();
            } else {
                console.error(`Command failed. Stderr:\n${stderrBuffer}`); // Use buffer for detailed error
                 if (logStream) logStream.write(`Command failed.\n`); // Log failure status
                reject(
                    new Error(
                        `Command failed: ${command}. Exit Code: ${code}. Stderr: ${stderrBuffer}` // Use buffer in error message
                    )
                );
            }
        });
    });
}

/**
 * Executes the Nginx reload command to apply new configuration.
 * Requires the user running the Node.js process to have NOPASSWD sudo permission
 * for the 'nginx -s reload' command.
 * @param logStream Optional WriteStream to pipe live output to.
 * @returns A promise that resolves if the reload is successful.
 * @throws Error if the reload command fails.
 */
async function reloadNginx(logStream: WriteStream | null = null): Promise<void> {
    console.log('Attempting to reload Nginx configuration...');
    if (logStream) logStream.write('Attempting to reload Nginx configuration...\n');
    // This function already uses executeShellCommand internally with the sudo command
    await executeShellCommand(NGINX_RELOAD_COMMAND, logStream); // Pass logStream
    console.log('Nginx configuration reloaded successfully.');
    // Log message handled inside executeShellCommand's success path or here. Let's add one here.
    if (logStream) logStream.write('Nginx configuration reloaded successfully.\n');
}

/**
 * Configures Nginx for a specific deployment.
 * Writes the configuration file, creates a symlink, and reloads Nginx.
 * Requires the user running the Node.js process to have NOPASSWD sudo permissions
 * for the necessary commands (tee, ln, nginx).
 * @param deploymentUrl The public URL for the deployment (including protocol).
 * @param internalPort The internal port the application is listening on.
 * @param deploymentId The ID of the deployment.
 * @param buildOutputPath The path to the extracted build artifacts on the VPS filesystem.
 * @param logFilePath Path to log file
 * @returns A promise that resolves when configuration and reload are complete.
 * @throws Error if any step fails.
 */
async function configureNginxForDeployment(
    deploymentUrl: string,
    internalPort: number,
    deploymentId: number,
    buildOutputPath: string,
    logFilePath: string // Accept log file path
): Promise<void> {
    console.log(`[Proxy Service] Configuring Nginx for deployment ${deploymentId}: ${deploymentUrl} -> 127.0.0.1:${internalPort}`);

    // Define and initialize log stream
    let logStream: WriteStream | null = null;
    try {
        // Ensure the directory for the log file exists
        await fs.mkdir(path.dirname(logFilePath), { recursive: true });
        // Create a writable stream in append mode
        logStream = createWriteStream(logFilePath, { flags: 'a' });
        logStream.write(
            `--- Nginx Configuration Started: ${new Date().toISOString()} ---\n`
        );
         logStream.write(`Deployment ID: ${deploymentId}, URL: ${deploymentUrl}, Internal Port: ${internalPort}\n`);
         // Optional: Add error handling for the log stream itself
         logStream.on('error', (err) => {
             console.error(`[Proxy Service] Error writing to log file stream ${logFilePath}: ${err.message}`);
         });

    } catch (streamErr: any) {
        console.error(
            `[Proxy Service] Failed to create or open log file stream ${logFilePath}: ${streamErr.message}`
        );
        // If stream creation failed, logStream remains null.
        // executeShellCommand will fall back to console logging.
        logStream = null;
    }


    const configFileName = `deploy-${deploymentId}.conf`;
    const sitesAvailablePath = path.join(
        NGINX_SITES_AVAILABLE_DIR,
        configFileName
    );
    const sitesEnabledPath = path.join(NGINX_SITES_ENABLED_DIR, configFileName);


    try {
        // 1. Generate configuration content
        console.log(`Generating Nginx config for ${deploymentUrl}.`);
        if (logStream) logStream.write(`Generating Nginx config for ${deploymentUrl}...\n`);
        const nginxConfigContent = generateNginxConfig( // Call the updated generateNginxConfig
            deploymentUrl,
            internalPort,
            buildOutputPath
        );


        // 2. Write the configuration file to sites-available using sudo tee
        console.log(
            `Attempting to write Nginx config to ${sitesAvailablePath} using sudo tee...`
        );
        if (logStream) logStream.write(`Attempting to write Nginx config to ${sitesAvailablePath} using sudo tee...\n`);

        await new Promise<void>((resolve, reject) => {
            // Command: sudo tee /path/to/file
            const teeProcess = spawn(`sudo tee ${sitesAvailablePath}`, {
                shell: true, // Required for sudo
                stdio: 'pipe', // stdin, stdout, stderr
            });

            let stderrBufferTee = ''; // Buffer stderr specifically for tee errors

            // Pipe tee's output (stdout/stderr) to the log stream if available, otherwise to console
            if (logStream) {
                 // Use { end: false } when piping to avoid closing the main log stream prematurely
                 teeProcess.stdout.pipe(logStream, { end: false });
                 teeProcess.stderr.pipe(logStream, { end: false });
            } else {
                 // Corrected: pipe tee process streams (Readable) to global process streams (Writable)
                 teeProcess.stdout.pipe(global.process.stdout);
                 teeProcess.stderr.pipe(global.process.stderr);
            }

            // Also capture stderr to buffer for rejection message
            teeProcess.stderr.on('data', (data) => {
                stderrBufferTee += data.toString();
            });


            teeProcess.on('error', (error) => {
                const errorMsg = `sudo tee process failed to start: ${error.message}`;
                console.error(errorMsg);
                 if (logStream) logStream.write(`\n--- sudo tee Process Error ---\n${errorMsg}\n`);
                reject(new Error(errorMsg));
            });

            teeProcess.on('close', (code) => {
                console.log(`sudo tee process exited with code ${code}`);
                 if (logStream) logStream.write(`sudo tee process exited with code ${code}\n`);
                if (code === 0) {
                    console.log('Nginx config file written successfully using sudo tee.');
                     if (logStream) logStream.write('Nginx config file written successfully.\n');
                    resolve();
                } else {
                    console.error(`sudo tee failed. Stderr:\n${stderrBufferTee}`); // Use buffer for error
                     if (logStream) logStream.write(`sudo tee failed.\n`);
                    reject(
                        new Error(
                            `Failed to write Nginx config using sudo tee. Exit Code: ${code}. Stderr: ${stderrBufferTee}` // Use buffer
                        )
                    );
                }
            });

            // Write the configuration content to the standard input of the tee process
            teeProcess.stdin.write(nginxConfigContent);
            teeProcess.stdin.end(); // End the input stream
        });

        // 3. Create a symbolic link in sites-enabled using sudo ln -sf
        // -s: create a symbolic link
        // -f: remove existing destination files/symlinks
        const symlinkCommand = `sudo ln -sf ${sitesAvailablePath} ${sitesEnabledPath}`;

        console.log(
            `Attempting to create symlink from ${sitesAvailablePath} to ${sitesEnabledPath} using sudo ln -sf...`
        );
        if (logStream) logStream.write(`Attempting to create symlink from ${sitesAvailablePath} to ${sitesEnabledPath} using sudo ln -sf...\n`);
        await executeShellCommand(symlinkCommand, logStream); // Pass logStream
        console.log('Symlink created successfully using sudo ln.');
        // Log message handled inside executeShellCommand's success path or here. Let's add one here.
        if (logStream) logStream.write('Symlink created successfully.\n');


        // 4. Reload Nginx to apply the new configuration
        await reloadNginx(logStream); // Pass logStream


        console.log(`Nginx configured successfully for deployment ${deploymentId}.`);
        if (logStream) {
            logStream.write(`Nginx configured successfully for deployment ${deploymentId}.\n`);
            logStream.write(`--- Nginx Configuration Finished: ${new Date().toISOString()} ---\n`);
            logStream.end(); // Explicitly close stream on success
        }

    } catch (error: any) {
        console.error(`[Proxy Service] Failed to configure Nginx: ${error.message}`);
        if (logStream) {
            logStream.write(`\n--- Nginx Configuration Failed: ${new Date().toISOString()} ---\n`);
            logStream.write(`Error: ${error.message}\n`);
            logStream.end(); // Explicitly close stream on error
        }
        throw error; // Re-throw the error
    }
}

// Future functions:
// async function removeNginxConfigForDeployment(deploymentId: number, logFilePath: string): Promise<void> { ... } // For stopping/deleting deployments
// async function updateNginxConfigForDeployment(deploymentId: number, newInternalPort: number, logFilePath: string): Promise<void> { ... } // If port changes

export { configureNginxForDeployment };
