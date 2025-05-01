// src/proxyService.ts

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises'; // Use promises version for async file operations
import { URL } from 'url'; // Import URL class

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

  // Basic Nginx server block template
  // IMPORTANT: Placeholder SSL config. You'll need to integrate Certbot or similar.
  // For initial testing, you might only listen on port 80 or use dummy SSL certs.
  return `
server {
    listen 80;
    # listen 443 ssl; # Uncomment and configure SSL later

    server_name ${hostname}; # Use only the hostname here

    # --- Placeholder SSL Configuration ---
    # ssl_certificate /etc/nginx/ssl/placeholder.crt;
    # ssl_certificate_key /etc/nginx/ssl/placeholder.key;
    # include snippets/ssl-params.conf; # Optional: include common SSL settings
    # --- End Placeholder SSL Configuration ---


    location / {
        proxy_pass http://127.0.0.1:${internalPort}; # Forward to the internal application port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        # Add other standard headers
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # --- Optional: Serve static assets directly via Nginx for performance ---
    # This requires the buildOutputPath to be accessible by Nginx on the VPS filesystem.
    # location /_next/static/ {
    #     alias ${buildOutputPath}/.next/static/; # Path to static assets in the extracted build
    #     expires 1y; # Cache static files for a long time
    #     access_log off; # Optional: reduce log noise for static files
    # }
    # location /public/ {
    #     alias ${buildOutputPath}/public/; # Path to public assets in the extracted build
    #     expires 1y;
    #     access_log off;
    # }
    # --- End Optional Static Assets ---

    # Error pages (optional)
    # error_page 500 502 503 504 /50x.html;
    # location = /50x.html {
    #     root /usr/share/nginx/html;
    # }

    # Optional: Add logging format
    # access_log /var/log/nginx/${hostname}.access.log combined; # Use hostname in log file name
    # error_log /var/log/nginx/${hostname}.error.log; # Use hostname in log file name
}
`;
}

/**
 * Executes a shell command that may require sudo, capturing stdout and stderr.
 * @param command The full command string to execute (e.g., 'sudo your_command').
 * @returns A promise that resolves if the command exits with code 0.
 * @throws Error if the command fails or the process exits with a non-zero code.
 */
async function executeShellCommand(command: string): Promise<void> {
  console.log(`Executing command: ${command}`);
  return new Promise((resolve, reject) => {
    const process = spawn(command, {
      shell: true, // Use the shell to handle sudo, pipes, etc.
      stdio: 'pipe', // Capture stdout and stderr
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('error', (error) => {
      console.error(
        `Command process failed to start: ${command}`,
        error.message
      );
      reject(
        new Error(
          `Command process failed to start: ${command}. ${error.message}`
        )
      );
    });

    process.on('close', (code) => {
      console.log(`Command process exited with code ${code}: ${command}`);
      if (code === 0) {
        console.log(`Command successful.`);
        resolve();
      } else {
        console.error(`Command failed. Stderr:\n${stderr}`);
        reject(
          new Error(
            `Command failed: ${command}. Exit Code: ${code}. Stderr: ${stderr}`
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
 * @returns A promise that resolves if the reload is successful.
 * @throws Error if the reload command fails.
 */
async function reloadNginx(): Promise<void> {
  // This function already uses executeShellCommand internally with the sudo command
  await executeShellCommand(NGINX_RELOAD_COMMAND);
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
 * @returns A promise that resolves when configuration and reload are complete.
 * @throws Error if any step fails.
 */
async function configureNginxForDeployment(
  deploymentUrl: string,
  internalPort: number,
  deploymentId: number,
  buildOutputPath: string
): Promise<void> {
  const configFileName = `deploy-${deploymentId}.conf`;
  const sitesAvailablePath = path.join(
    NGINX_SITES_AVAILABLE_DIR,
    configFileName
  );
  const sitesEnabledPath = path.join(NGINX_SITES_ENABLED_DIR, configFileName);

  console.log(
    `Configuring Nginx for deployment ${deploymentId}: ${deploymentUrl} -> 127.0.0.1:${internalPort}`
  );

  // 1. Generate configuration content
  const nginxConfigContent = generateNginxConfig(
    deploymentUrl,
    internalPort,
    buildOutputPath
  );
  console.log(`Generated Nginx config for ${deploymentUrl}.`);

  // 2. Write the configuration file to sites-available using sudo tee
  // We use 'tee' to write standard input to a file with sudo permissions.
  // It's generally safer than 'sudo echo > file' which can be tricky with quotes.
  // Using echo and piping works, but requires careful escaping of quotes in the content.
  // A more robust way is piping to stdin.

  console.log(
    `Attempting to write Nginx config to ${sitesAvailablePath} using sudo tee...`
  );

  await new Promise<void>((resolve, reject) => {
    // Command: sudo tee /path/to/file
    const teeProcess = spawn(`sudo tee ${sitesAvailablePath}`, {
      shell: true, // Required for sudo
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
    });

    let stderr = '';
    teeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    teeProcess.on('error', (error) => {
      console.error(`sudo tee process failed to start: ${error.message}`);
      reject(new Error(`sudo tee process failed to start: ${error.message}`));
    });

    teeProcess.on('close', (code) => {
      console.log(`sudo tee process exited with code ${code}`);
      if (code === 0) {
        console.log('Nginx config file written successfully using sudo tee.');
        resolve();
      } else {
        console.error(`sudo tee failed. Stderr:\n${stderr}`);
        reject(
          new Error(
            `Failed to write Nginx config using sudo tee. Exit Code: ${code}. Stderr: ${stderr}`
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
  await executeShellCommand(symlinkCommand);
  console.log('Symlink created successfully using sudo ln.');

  // 4. Reload Nginx to apply the new configuration
  console.log('Attempting to reload Nginx configuration...');
  await reloadNginx(); // This function already exists and uses sudo
  console.log(`Nginx configured successfully for deployment ${deploymentId}.`);

  // The main configureNginxForDeployment promise resolves implicitly if the chain finishes without error
}

// Future functions:
// async function removeNginxConfigForDeployment(deploymentId: number): Promise<void> { ... } // For stopping/deleting deployments
// async function updateNginxConfigForDeployment(deploymentId: number, newInternalPort: number): Promise<void> { ... } // If port changes

export { configureNginxForDeployment };
