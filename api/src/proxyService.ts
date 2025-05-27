import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises'; // Use promises version for async file operations
import { URL } from 'url';    // For parsing the deploymentUrl
import { createWriteStream, WriteStream } from 'fs'; // For file streaming (logs)

// --- Configuration Constants ---
// IMPORTANT: Adjust these paths and commands based on your VPS environment!
const NGINX_SITES_AVAILABLE_DIR = '/etc/nginx/sites-available'; // Standard Nginx directory
const NGINX_SITES_ENABLED_DIR = '/etc/nginx/sites-enabled';     // Standard Nginx directory
const NGINX_RELOAD_COMMAND = 'sudo nginx -s reload';          // Command to reload Nginx config
// --- End Configuration Constants ---

/**
 * Generates the Nginx server block configuration content for a deployment.
 * @param deploymentUrl The public URL (e.g., https://subdomain.example.com) for the deployment.
 * @param internalPort The internal port the application is listening on (e.g., 4001).
 * @param buildOutputPath The path to the extracted build artifacts on the VPS filesystem (used for static assets).
 * @param useHttps Boolean indicating whether to generate HTTPS configuration (SSL, port 443, HTTP redirect).
 * @returns The Nginx configuration string.
 */
function generateNginxConfig(
    deploymentUrl: string,
    internalPort: number,
    buildOutputPath: string, // Path to where .next/static and public/ are located after extraction
    useHttps: boolean
): string {
    const url = new URL(deploymentUrl); // Parses the full URL
    const hostname = url.hostname;      // Extracts just the hostname (e.g., deploy-123.nextlivenow.app)

    // Define SSL directives if HTTPS is enabled
    const sslDirectives = useHttps ? `
    # --- SSL Configuration ---
    # IMPORTANT: Ensure your SSL certificate and key paths are correct and accessible by Nginx.
    # These paths should point to the actual certificate files for the given hostname.
    # Example for Let's Encrypt with Certbot (adjust as needed):
    # ssl_certificate /etc/letsencrypt/live/${hostname}/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/${hostname}/privkey.pem;
    #
    # Using a wildcard or specific cert from a shared SSL directory:
    ssl_certificate /etc/nginx/ssl/${hostname}.crt; # Example: /etc/nginx/ssl/deploy-123.nextlivenow.app.crt
    ssl_certificate_key /etc/nginx/ssl/${hostname}.key; # Example: /etc/nginx/ssl/deploy-123.nextlivenow.app.key
    # Or for a wildcard cert:
    # ssl_certificate /etc/nginx/ssl/wildcard.nextlivenow.app.crt;
    # ssl_certificate_key /etc/nginx/ssl/wildcard.nextlivenow.app.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    # Recommended modern cipher suite
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off; # Let modern clients negotiate the best cipher

    # SSL Session settings
    ssl_session_cache shared:SSL:10m; # 10MB shared cache for all workers
    ssl_session_timeout 1d;           # Sessions can be reused for 1 day
    ssl_session_tickets off;          # More secure, slight performance hit for session resumption

    # Security Headers (recommended)
    # add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    # add_header X-Frame-Options DENY always;
    # add_header X-Content-Type-Options nosniff always;
    # add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # OCSP Stapling (optional, improves SSL handshake performance)
    # ssl_stapling on;
    # ssl_stapling_verify on;
    # resolver 8.8.8.8 1.1.1.1 valid=300s; # DNS resolvers for OCSP
    # resolver_timeout 5s;
    # --- End SSL Configuration ---
    ` : '';

    // Define server listen port based on HTTPS status
    const serverListenPort = useHttps ? '443 ssl http2' : '80';
    const serverListenIpV6Port = useHttps ? '[::]:443 ssl http2' : '[::]:80'; // For IPv6

    // Define HTTP to HTTPS redirect block if HTTPS is enabled
    const httpRedirectBlock = useHttps ? `
server {
    listen 80;
    listen [::]:80; # IPv6
    server_name ${hostname};

    # For Let's Encrypt ACME challenge (if you use http-01 challenge)
    # location ~ /.well-known/acme-challenge {
    #     allow all;
    #     root /var/www/html; # Or your designated ACME challenge root
    # }

    # Redirect all other HTTP traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}
` : '';

    // Ensure paths for alias directives use forward slashes and are correctly joined
    const staticAssetsPath = path.join(buildOutputPath, '.next/static').replace(/\\/g, '/');
    const publicAssetsPath = path.join(buildOutputPath, 'public').replace(/\\/g, '/');

    // Main server block
    return `
${httpRedirectBlock}
server {
    listen ${serverListenPort};
    listen ${serverListenIpV6Port}; # For IPv6
    server_name ${hostname};

    ${sslDirectives} # This will be empty if useHttps is false

    # Optional: Define root for server_name for favicon or other root files if not handled by Next.js
    # root ${publicAssetsPath}; # Example if favicon.ico is in public/

    # Logging (customize paths as needed)
    # access_log /var/log/nginx/${hostname}.access.log;
    # error_log /var/log/nginx/${hostname}.error.log warn;

    # Max upload size (optional, default is usually 1MB)
    # client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${internalPort}; # Proxy to the internal Node.js app
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade; # Required for WebSockets
        proxy_set_header Connection 'upgrade';  # Required for WebSockets
        proxy_set_header Host $host; # Pass the original host header
        proxy_cache_bypass $http_upgrade; # Don't cache WebSocket upgrades

        # Pass client IP information
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme; # http or https

        # Optional: Increase timeouts for long-running requests or Server-Sent Events (SSE)
        # proxy_connect_timeout 60s;
        # proxy_send_timeout 300s;
        # proxy_read_timeout 300s;
    }

    # Serve Next.js static assets directly for better performance
    # The path in the 'alias' directive must be the absolute path on the server.
    location /_next/static {
        alias ${staticAssetsPath}/; # Note the trailing slash on the alias path
        expires 1y;             # Cache these assets aggressively in client browsers
        access_log off;         # Disable access logging for static assets
        add_header Cache-Control "public"; # Explicitly set Cache-Control header
    }

    # Serve files from the public directory directly
    location /public {
        alias ${publicAssetsPath}/; # Note the trailing slash
        expires 1y;
        access_log off;
        add_header Cache-Control "public";
    }

    # Optional: Deny access to hidden files (e.g., .git, .env) if they accidentally end up in public
    # location ~ /\. {
    #     deny all;
    # }
}
`;
}


/**
 * Executes a shell command, capturing stdout and stderr.
 * @param command The full command string to execute (e.g., 'sudo nginx -s reload').
 * @param logStream Optional WriteStream to pipe live output to.
 * @returns A promise that resolves if the command exits with code 0.
 */
async function executeShellCommand(command: string, logStream: WriteStream | null = null): Promise<void> {
    console.log(`[Proxy Service] Executing command: ${command}`);
    if (logStream) logStream.write(`Executing command: ${command}\n`);

    return new Promise((resolve, reject) => {
        const process = spawn(command, {
            shell: true,   // Use the shell to handle sudo, pipes, etc.
            stdio: 'pipe', // Capture stdout and stderr
        });

        let stdoutBuffer = '';
        let stderrBuffer = '';

        // Pipe live output if logStream is provided, or to console as fallback
        if (logStream) {
            process.stdout.pipe(logStream, { end: false }); // Avoid closing main log stream
            process.stderr.pipe(logStream, { end: false });
        } else {
            process.stdout.pipe(global.process.stdout);
            process.stderr.pipe(global.process.stderr);
        }
        // Also buffer output for error reporting
        process.stdout.on('data', (data) => { stdoutBuffer += data.toString(); });
        process.stderr.on('data', (data) => { stderrBuffer += data.toString(); });

        process.on('error', (error) => {
            const errorMsg = `Command process failed to start: '${command}'. Error: ${error.message}`;
            console.error(`[Proxy Service] ${errorMsg}`);
            if (logStream) logStream.write(`\n--- Command Process Error ---\n${errorMsg}\n`);
            reject(new Error(errorMsg));
        });

        process.on('close', (code) => {
            console.log(`[Proxy Service] Command process for '${command}' exited with code ${code}.`);
            if (logStream) logStream.write(`Command '${command}' exited with code ${code}\n`);

            if (code === 0) {
                console.log(`[Proxy Service] Command '${command}' executed successfully.`);
                if (logStream) logStream.write(`Command successful.\n`);
                resolve();
            } else {
                const errorDetail = `Command failed: '${command}'. Exit Code: ${code}.\nStdout:\n${stdoutBuffer}\nStderr:\n${stderrBuffer}`;
                console.error(`[Proxy Service] ${errorDetail}`);
                if (logStream) logStream.write(`Command failed.\n${errorDetail}\n`);
                reject(new Error(errorDetail));
            }
        });
    });
}

/**
 * Executes the Nginx reload command.
 * @param logStream Optional WriteStream to pipe live output to.
 */
async function reloadNginx(logStream: WriteStream | null = null): Promise<void> {
    console.log('[Proxy Service] Attempting to reload Nginx configuration...');
    if (logStream) logStream.write('Attempting to reload Nginx configuration...\n');
    await executeShellCommand(NGINX_RELOAD_COMMAND, logStream);
    console.log('[Proxy Service] Nginx configuration reloaded successfully.');
    if (logStream) logStream.write('Nginx configuration reloaded successfully.\n');
}

/**
 * Configures Nginx for a specific deployment.
 * Writes the configuration file, creates a symlink, and reloads Nginx.
 * This function is intended to be called when Nginx proxying is required (e.g., in production).
 * @param deploymentUrl The public URL for the deployment (e.g., https://deploy-id.nextlivenow.app).
 * @param internalPort The internal port the application is listening on.
 * @param deploymentId The ID of the deployment, used for naming config files.
 * @param buildOutputPath The path to the extracted build artifacts (for serving static files).
 * @param logFilePath Path to the main log file for this deployment.
 * @param useHttps Boolean indicating whether to set up HTTPS (SSL, port 443, HTTP redirect).
 */
export async function configureNginxForDeployment(
    deploymentUrl: string,
    internalPort: number,
    deploymentId: number,
    buildOutputPath: string,
    logFilePath: string,
    useHttps: boolean // This parameter determines if HTTPS is configured
): Promise<void> {
    console.log(`[Proxy Service] Configuring Nginx for deployment ${deploymentId}: ${deploymentUrl} -> 127.0.0.1:${internalPort} (HTTPS: ${useHttps})`);

    let logStream: WriteStream | null = null;
    try {
        // Ensure log directory exists and create append stream for Nginx specific logs
        await fs.mkdir(path.dirname(logFilePath), { recursive: true });
        logStream = createWriteStream(logFilePath, { flags: 'a' });
        logStream.write(`--- Nginx Configuration Started: ${new Date().toISOString()} ---\n`);
        logStream.write(`Deployment ID: ${deploymentId}, URL: ${deploymentUrl}, Internal Port: ${internalPort}, HTTPS: ${useHttps}\n`);
        logStream.on('error', (err) => {
            console.error(`[Proxy Service] Error writing to Nginx log section in ${logFilePath}: ${err.message}`);
        });
    } catch (streamErr: any) {
        console.error(`[Proxy Service] Failed to create or open log file stream ${logFilePath} for Nginx config: ${streamErr.message}`);
        logStream = null; // Proceed without file logging if stream fails
    }

    // Generate a unique config file name, e.g., based on deploymentId or hostname
    let configFileName = `deploy-${deploymentId}.conf`;
    try {
        const parsedUrl = new URL(deploymentUrl);
        // Using a sanitized hostname can make Nginx configs easier to identify
        // const safeHostname = parsedUrl.hostname.replace(/[^a-z0-9.-]/gi, '_');
        // configFileName = `${safeHostname}.conf`; // Example: deploy-123.nextlivenow.app.conf
    } catch(e) {
        console.warn(`[Proxy Service] Could not parse deploymentUrl "${deploymentUrl}" to generate hostname-based config filename. Using default: ${configFileName}.`);
    }

    const sitesAvailablePath = path.join(NGINX_SITES_AVAILABLE_DIR, configFileName);
    const sitesEnabledPath = path.join(NGINX_SITES_ENABLED_DIR, configFileName);

    try {
        // 1. Generate Nginx configuration content
        console.log(`[Proxy Service] Generating Nginx config for ${deploymentUrl} (HTTPS: ${useHttps}).`);
        if (logStream) logStream.write(`Generating Nginx config for ${deploymentUrl} (HTTPS: ${useHttps})...\n`);
        
        const nginxConfigContent = generateNginxConfig(
            deploymentUrl,
            internalPort,
            buildOutputPath,
            useHttps // Pass the received parameter
        );
        console.log(`[Proxy Service] Nginx config content generated for ${sitesAvailablePath}.`);
        if (logStream) logStream.write(`Nginx Config Content Generated:\n${nginxConfigContent}\n`);

        // 2. Write the configuration file to sites-available using sudo tee
        console.log(`[Proxy Service] Attempting to write Nginx config to ${sitesAvailablePath} using sudo tee...`);
        if (logStream) logStream.write(`Attempting to write Nginx config to ${sitesAvailablePath} using sudo tee...\n`);
        await new Promise<void>((resolve, reject) => {
            const teeProcess = spawn(`sudo tee ${sitesAvailablePath}`, { shell: true, stdio: 'pipe' });
            let stderrBufferTee = ''; // Buffer stderr specifically for tee errors
            if (logStream) {
                teeProcess.stdout.pipe(logStream, { end: false });
                teeProcess.stderr.pipe(logStream, { end: false });
            } else {
                teeProcess.stdout.pipe(global.process.stdout);
                teeProcess.stderr.pipe(global.process.stderr);
            }
            teeProcess.stderr.on('data', (data) => { stderrBufferTee += data.toString(); });
            teeProcess.on('error', (error) => {
                const errorMsg = `sudo tee process for ${sitesAvailablePath} failed to start: ${error.message}`;
                if (logStream) logStream.write(`\n--- sudo tee Process Error ---\n${errorMsg}\n`);
                reject(new Error(errorMsg));
            });
            teeProcess.on('close', (code) => {
                if (logStream) logStream.write(`sudo tee process for ${sitesAvailablePath} exited with code ${code}\n`);
                if (code === 0) {
                    if (logStream) logStream.write('Nginx config file written successfully to sites-available.\n');
                    resolve();
                } else {
                    const teeError = `Failed to write Nginx config to ${sitesAvailablePath} using sudo tee. Exit Code: ${code}. Stderr: ${stderrBufferTee}`;
                    if (logStream) logStream.write(`${teeError}\n`);
                    reject(new Error(teeError));
                }
            });
            teeProcess.stdin.write(nginxConfigContent); // Write config to tee's stdin
            teeProcess.stdin.end(); // Close stdin to signal end of input
        });

        // 3. Create a symbolic link in sites-enabled using sudo ln -sf
        const symlinkCommand = `sudo ln -sf ${sitesAvailablePath} ${sitesEnabledPath}`;
        console.log(`[Proxy Service] Attempting to create symlink: ${symlinkCommand}`);
        if (logStream) logStream.write(`Attempting to create symlink: ${symlinkCommand}...\n`);
        await executeShellCommand(symlinkCommand, logStream);
        console.log(`[Proxy Service] Symlink created successfully: ${sitesEnabledPath} -> ${sitesAvailablePath}`);
        if (logStream) logStream.write('Symlink created successfully.\n');

        // 4. Reload Nginx to apply the new configuration
        await reloadNginx(logStream);

        console.log(`[Proxy Service] Nginx configured and reloaded successfully for deployment ${deploymentId}.`);
        if (logStream) {
            logStream.write(`Nginx configured and reloaded successfully for deployment ${deploymentId}.\n`);
            logStream.write(`--- Nginx Configuration Finished: ${new Date().toISOString()} ---\n`);
            logStream.end(); // Close log stream on success
        }
    } catch (error: any) {
        console.error(`[Proxy Service] Failed to configure Nginx for deployment ${deploymentId}: ${error.message}`, error.stack);
        if (logStream) {
            logStream.write(`\n--- Nginx Configuration Failed: ${new Date().toISOString()} ---\n`);
            logStream.write(`Error: ${error.message}\nStack: ${error.stack || 'N/A'}\n`);
            logStream.end(); // Close log stream on error
        }
        throw error; // Re-throw the error to be caught by processDeployment
    }
}
