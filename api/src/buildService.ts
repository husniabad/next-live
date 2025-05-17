// src/buildService.ts

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises'; // Use promises version for async file operations
import { createWriteStream, WriteStream } from 'fs'; // Import for file streaming
import fsSync from 'fs'; // Use sync version for existsSync
import { finished } from 'stream/promises'; // Import for waiting on stream finish

const DEFAULT_DOCKERFILE_PATH = path.resolve(
  __dirname,
  'dockerfiles',
  'Dockerfile.nextjs.default'
);

/**
 * Builds a Docker image for a given repository.
 * Checks for a user-provided Dockerfile or uses a default for Next.js projects.
 * Validates Next.js projects for standalone output configuration when using the default Dockerfile.
 * @param repoPath The path to the cloned repository.
 * @param imageName The desired name/tag for the Docker image.
 * @param logFilePath Path to log file
 * @param buildArgs An optional object of build arguments to pass (e.g., { NEXT_PUBLIC_API_URL: '...' }).
 * @returns A promise that resolves with an object indicating which Dockerfile was used, or rejects on failure.
 * @throws Error if the Docker build fails.
 */
async function buildProjectImage(
  repoPath: string,
  imageName: string,
  logFilePath: string,
  buildArgs: { [key: string]: string } = {}
): Promise<{ dockerfileUsed: string }> {
  console.log('[Build Service] Starting Docker image build for', imageName, 'from', repoPath);
  console.log('[Build Service] Appending build logs to:', logFilePath);
  console.log('Resolved default Dockerfile path:', DEFAULT_DOCKERFILE_PATH);

  // We will collect stdout and stderr into strings for potential error reporting
  let stdoutBuffer = '';
  let stderrBuffer = '';

  let logStream: WriteStream | null = null;

  try {
    // Ensure the directory for the log file exists
    await fs.mkdir(path.dirname(logFilePath), { recursive: true });
    // Create a writable stream in append mode
    logStream = createWriteStream(logFilePath, { flags: 'a' });
    logStream.write(
      `--- Docker Build Started: ${new Date().toISOString()} ---\n`
    );
    console.log(`[Build Service] Log stream created for ${logFilePath}.`);
     // Optional: Add error handling for the log stream itself
     logStream.on('error', (err) => {
         console.error(`[Build Service] Error writing to log file stream ${logFilePath}: ${err.message}`);
         // If a stream error occurs, subsequent writes/pipes might fail.
         // For robustness, log the error but the stream might become unusable.
     });
  } catch (streamErr: any) {
    console.error(
      `[Build Service] Failed to create or open log file stream ${logFilePath}: ${streamErr.message}`
    );
    logStream = null; // Ensure logStream is null if creation failed
    // If stream creation fails, we can't log to file, but the process might still run.
  }


  const userDockerfilePath = path.join(repoPath, 'Dockerfile'); // Standard Dockerfile name
  let dockerfilePathToUse = '';
  let dockerfileSource = 'unknown'; // 'user' or 'default'
  const buildContext = repoPath; // The directory containing the Dockerfile and code

  // --- Dockerfile Detection and Config Check Logic ---
  try {
      // Log the start of the detection process
      if (logStream) logStream.write(`--- Dockerfile Detection & Configuration Check Started ---\n`);

      console.log(`Checking for user-provided Dockerfile at: ${userDockerfilePath}`);
      if (logStream) logStream.write(`Checking for user-provided Dockerfile at: ${userDockerfilePath}\n`);

      if (fsSync.existsSync(userDockerfilePath)) {
        console.log(`User-provided Dockerfile found. Using: ${userDockerfilePath}`);
        if (logStream) logStream.write(`User-provided Dockerfile found.\n`);
        dockerfilePathToUse = userDockerfilePath;
        dockerfileSource = 'user';

      } else {

        if (!fsSync.existsSync(DEFAULT_DOCKERFILE_PATH)) {
          const errorMsg = `FATAL: Default Next.js Dockerfile not found at expected path: ${DEFAULT_DOCKERFILE_PATH}`;
          console.error(errorMsg);
          // Write error to stderr buffer before throwing
          stderrBuffer += `\n--- Build Configuration Error ---\n${errorMsg}\n`;
          if (logStream) {
               logStream.write(`FATAL: Default Next.js Dockerfile not found on the server: ${DEFAULT_DOCKERFILE_PATH}\n`);
               logStream.write(`\n--- Build Configuration Error ---\n${errorMsg}\n`);
               logStream.write(`--- Docker Build Failed: ${new Date().toISOString()} (Config Error) ---\n`);
               logStream.end(); // Close stream on early config error
           }
              throw new Error(
                `Configuration error: Default Next.js Dockerfile is missing on the build server at ${DEFAULT_DOCKERFILE_PATH}.`
              );
        }

        console.log(`Default Next.js Dockerfile found at: ${DEFAULT_DOCKERFILE_PATH}`);
        if (logStream) logStream.write(`Default Next.js Dockerfile found.\n`);


        // --- Next.js Detection Logic ---
        console.log(`Attempting to detect Next.js project...`);
        if (logStream) logStream.write(`Attempting to detect Next.js project...\n`);
        let isNextProject = false;
        const packageJsonPath = path.join(repoPath, 'package.json'); // Use repoPath here
        const nextConfigJsPath = path.join(repoPath, 'next.config.js'); // Use repoPath here
        const nextConfigMjsPath = path.join(repoPath, 'next.config.mjs'); // Use repoPath here
        const nextConfigTsPath = path.join(repoPath, 'next.config.ts'); // Use repoPath here

        let nextConfigPath = null; // Path to the found next.config file

        // 1. Check for standard next.config file existence first
        if (fsSync.existsSync(nextConfigJsPath)) {
          isNextProject = true;
          nextConfigPath = nextConfigJsPath;
          console.log(`Detected Next.js project via next.config.js file.`);
          if (logStream) logStream.write(`Detected Next.js project via next.config.js file.\n`);
        } else if (fsSync.existsSync(nextConfigMjsPath)) {
          isNextProject = true;
          nextConfigPath = nextConfigMjsPath;
          console.log(`Detected Next.js project via next.config.mjs file.`);
          if (logStream) logStream.write(`Detected Next.js project via next.config.mjs file.\n`);
        } else if (fsSync.existsSync(nextConfigTsPath)) {
          isNextProject = true;
          nextConfigPath = nextConfigTsPath;
          console.log(`Detected Next.js project via next.config.ts file.`);
          if (logStream) logStream.write(`Detected Next.js project via next.config.ts file.\n`);
        }

        // 2. Fallback check via package.json if no next.config file found yet
        if (!isNextProject && fsSync.existsSync(packageJsonPath)) {
          try {
            const packageJsonContent = fsSync.readFileSync(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(packageJsonContent);
            if (
              packageJson.dependencies?.next ||
              packageJson.devDependencies?.next
            ) {
              isNextProject = true; // It is likely a Next.js project
              console.log(
                `Detected potential Next.js project via package.json dependencies.`
              );
              if (logStream) logStream.write(`Detected potential Next.js project via package.json dependencies.\n`);
            }
          } catch (error: any) {
            console.warn(
              `Failed to read or parse package.json at ${packageJsonPath}: ${error.message}`
            );
            if (logStream) logStream.write(`Warning: Failed to read or parse package.json: ${error.message}\n`);
            // Continue without this check if package.json is invalid
          }
        }
        // --- End Next.js Detection Logic ---


        if (isNextProject) {
          console.log(`Project identified as Next.js.`);
          if (logStream) logStream.write(`Project identified as Next.js.\n`);

          // --- Next.js Standalone Config Check ---
          if (nextConfigPath) {
            console.log(`Checking Next.js config file for 'output: "standalone"': ${path.basename(nextConfigPath)}`);
            if (logStream) logStream.write(`Checking Next.js config file for 'output: "standalone"': ${path.basename(nextConfigPath)}\n`);
            try {
              const configContent = await fs.readFile(nextConfigPath, 'utf8');
              const isStandalone =
                configContent.toLowerCase().includes('output:') &&
                (configContent.includes('"standalone"') ||
                  configContent.includes("'standalone'") ||
                  configContent.includes('`standalone`'));

              if (!isStandalone) {
                const errorMsg = `Next.js configuration check failed: '${path.basename(
                  nextConfigPath
                )}' does not contain 'output: "standalone"' or similar required for the default build.`;
                console.error(errorMsg);
                stderrBuffer += `\n--- Build Configuration Error ---\n${errorMsg}\n`;
                if (logStream) logStream.write(`Next.js configuration check failed: 'output: "standalone"' not found.\n`);
                throw new Error(
                  `Next.js build configuration error: Please add 'output: "standalone",' to your ${path.basename(
                    nextConfigPath
                  )} file in the repository root to use the default build process.`
                )
              }
              console.log(
                `Next.js configuration check passed: 'output: "standalone"' or similar found.`
              );
              if (logStream) logStream.write(`Next.js configuration check passed: 'output: "standalone"' found.\n`);
            } catch (error: any) {
              console.error(
                `Failed to read or check Next.js config file at ${nextConfigPath}: ${error.message}`
              );
              stderrBuffer += `\n--- Build Configuration Error ---\n${error.message}\n`;
              if (logStream) logStream.write(`Failed to read or check Next.js config file: ${error.message}\n`);
              throw new Error(
                `Failed to read or check Next.js configuration file at ${path.basename(
                  nextConfigPath
                )}: ${error.message}`
              )
            }
            // --- End Next.js Standalone Config Check ---
          } else {
            // Project detected as Next.js (via package.json) but no next.config.* file found.
            const errorMsg = `Next.js configuration check failed: Project detected, but no next.config.js/mjs/ts found in repository root.`;
            console.error(errorMsg);
            stderrBuffer += `\n--- Build Configuration Error ---\n${errorMsg}\n`;
            if (logStream) logStream.write(`Next.js configuration check failed: No next.config file found.\n`);
            throw new Error(
              `Next.js configuration error: Project detected, but no Next.js configuration file found. Please add a 'next.config.js', 'next.config.mjs', or 'next.config.ts' file with 'output: "standalone",' to your repository root.`
            )
          }

          // If we reached here, it's a Next.js project and the config check passed
          console.log(
            `Using default Next.js Dockerfile: ${DEFAULT_DOCKERFILE_PATH}`
          );
          if (logStream) logStream.write(`Using default Next.js Dockerfile.\n`);
          dockerfilePathToUse = DEFAULT_DOCKERFILE_PATH;
          dockerfileSource = 'default';
        } else {
          // Not detected as a Next.js project and no user Dockerfile provided.
          const errorMsg = `Build failed for ${repoPath}: No Dockerfile found in the repository root, and it could not be identified as a Next.js project.`;
          console.error(errorMsg);
          stderrBuffer += `\n--- Build Configuration Error ---\n${errorMsg}\n`;
          if (logStream) logStream.write(`Build failed: No Dockerfile found and not identified as Next.js project.\n`);
          throw new Error(
            `Build failed: No Dockerfile found in repository root (${userDockerfilePath}) and automatic Next.js project detection failed. Please provide a Dockerfile or ensure it's a standard Next.js project.`
          )
        }
      }
      // --- End Dockerfile Detection and Config Check Logic ---

      if (logStream) logStream.write(`--- Dockerfile Detection & Configuration Check Finished ---\n`);

  } catch (configError: any) {
     // If a configuration error occurs before spawning Docker, write the buffered stderr
     // and then re-throw the error.
       console.error('[Build Service] Configuration check failed:', configError.message);
      if (logStream) {
           // Write any data buffered *before* the throw (though unlikely much here)
           logStream.write(stdoutBuffer);
           logStream.write(stderrBuffer);
           logStream.write(`\n--- Docker Build Failed: ${new Date().toISOString()} (Config Error) ---\n`);
           logStream.end(); // Close stream on early config error
      }
     throw configError; // Re-throw the original configuration error
  }


  // --- Proceed with Docker build using spawn ---
  const args = [
    'build',
    '-t',
    imageName,
    '-f',
    dockerfilePathToUse, // Pass path as a separate argument
  ];

  Object.entries(buildArgs).forEach(([key, value]) => {
    args.push('--build-arg', `${key}=${value}`);
  });

  args.push(buildContext); // Add context path as the last argument

  console.log(
    `Executing Docker build command (using spawn): docker ${args.join(' ')}`
  );
  if (logStream) logStream.write(`Executing Docker build command: docker ${args.join(' ')}\n`);


  return new Promise((resolve, reject) => {
    const dockerProcess = spawn('docker', args, {
      cwd: buildContext, // Set working directory to the build context (optional, but good practice)
      stdio: 'pipe', // Pipe stdout/stderr to capture
    });

    // --- Collect stream data into buffers ---
    // These listeners ONLY collect data to buffers.
    dockerProcess.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
    });

    dockerProcess.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
    });
    // --- End buffer collection ---

    // --- Pipe live output to log stream or console ---
    if (logStream) {
        // Pipe output to log stream, do not end the stream automatically
        dockerProcess.stdout.pipe(logStream, { end: false });
        dockerProcess.stderr.pipe(logStream, { end: false });
    } else {
        // Fallback: pipe to console if log stream is not available
        dockerProcess.stdout.pipe(global.process.stdout);
        dockerProcess.stderr.pipe(global.process.stderr);
    }
    // --- End piping live output ---


    dockerProcess.on('error', (error) => {
      const errorMsg = `Docker process failed to start: ${error.message}`;
      console.error(errorMsg);

      // Write collected buffers and end stream on process error
      if (logStream) {
           logStream.write(`\n--- Docker Process Error ---\n${errorMsg}\n`);
           // Write buffered data at the end as a safeguard if piping missed anything
           logStream.write(stdoutBuffer);
           logStream.write(stderrBuffer); // Includes potentially filtered messages
           logStream.write(`\n--- Docker Build Failed: ${new Date().toISOString()} (Process Error) ---\n`);
           logStream.end(); // Explicitly close stream
      }

      reject(new Error(errorMsg));
    });


    dockerProcess.on('close', (code) => {
      console.log(`Docker build process exited with code ${code}`);

      // Write collected buffers and end stream on process close
      if (logStream) {
           // Write buffered data at the end as a safeguard if piping missed anything
           logStream.write(stdoutBuffer);
           logStream.write(stderrBuffer); // Includes potentially filtered messages

        if (code === 0) {
          logStream.write(`\n--- Docker Build Finished: ${new Date().toISOString()} (Exit Code: ${code}) ---\n`);
        } else {
          logStream.write(`\n--- Docker Build Failed: ${new Date().toISOString()} (Exit Code: ${code}) ---\n`);
        }
        logStream.end(); // Explicitly close stream
      }


      if (code === 0) {
        console.log(`Successfully built image: ${imageName}`);
        resolve({ dockerfileUsed: dockerfileSource });
      } else {
        console.error(`Docker build failed for image ${imageName}`);
        const fullErrorDetails = `Docker build failed (Using ${dockerfileSource} Dockerfile).\nCommand: docker ${args.join(
          ' '
        )}\nExit Code: ${code}\nStdout:\n${stdoutBuffer}\nStderr:\n${stderrBuffer}`;
        reject(new Error(fullErrorDetails));
      }
    });
  });
}

/**
 * Runs the built Docker image briefly to extract build artifacts via a volume mount.
 * Assumes the image was built to place artifacts in /app.
 * NOTE: This currently assumes artifacts are located at /app inside the image
 * and copies them to the host's extractPath. This needs generalization
 * if supporting arbitrary Dockerfiles with different artifact locations.
 * @param imageName The name/tag of the built Docker image.
 * @param buildOutputPath The host path where the artifacts should be copied to.
 * @param logFilePath Path to log file
 * @returns A promise that resolves when extraction is complete.
 * @throws Error if the Docker extraction command fails.
 */
async function extractBuildArtifacts(imageName: string, buildOutputPath: string, logFilePath: string): Promise<void> {
  console.log(`[Build Service] Starting artifact extraction for deployment from image ${imageName} to ${buildOutputPath}...`);

  let logStream: WriteStream | null = null;

  try {
    await fs.mkdir(path.dirname(logFilePath), { recursive: true });
    logStream = createWriteStream(logFilePath, { flags: 'a' });
    logStream.write(
      `--- Artifact Extraction Started: ${new Date().toISOString()} ---\n`
    );
    logStream.write(`Attempting to extract from image ${imageName} to ${buildOutputPath}\n`);
     // Optional: Add error handling for the log stream itself
     logStream.on('error', (err) => {
         console.error(`[Build Service] Error writing to extraction log file stream ${logFilePath}: ${err.message}`);
     });
  } catch (streamErr: any) {
    console.error(
      `[Build Service] Failed to create or open log file stream ${logFilePath} for extraction: ${streamErr.message}`
    );
    logStream = null;
  }


  // Ensure the target output directory exists on the host
  await fs.mkdir(buildOutputPath, { recursive: true }); // Use async version

  return new Promise((resolve, reject) => {
    // Command and arguments for spawn
    const cmd = 'docker';
    const args = [
      'run',
      '--rm', // Automatically remove the container when it exits
      '-v',
      `${buildOutputPath}:/extracted-output`, // Mount host path to a temp container dir
      imageName, // The image (the runner stage is the default)
      'sh',
      '-c', // Use sh to run the copy command
      // --- CORRECTED COPY COMMAND ---
      // Copy everything from the runner stage's WORKDIR (/app) to the mounted volume path (/extracted-output)
      // The trailing /. on the source copies the *contents* of /app rather than /app itself.
      // Use '|| true' to prevent cp permission errors on mounted drives from failing the command
      `cp -R /app/. /extracted-output/ || true`, // Added || true here
      // --- End CORRECTED COPY COMMAND ---
    ];

    console.log(
      `Executing Docker extract command (using spawn): ${cmd} ${args.join(' ')}`
    );
    if (logStream) logStream.write(`Executing Docker extract command: ${cmd} ${args.join(' ')}\n`);


    const dockerProcess = spawn(cmd, args, {
      stdio: 'pipe', // Pipe stdout/stderr
    });

    let stdoutBuffer = ''; // Capture full stdout for potential error reporting
    let stderrBuffer = ''; // Capture full stderr for potential error reporting

    // String to filter out from log file
    const filterString = "cp: can't preserve permissions of";

    // --- Collect stream data into buffers and write to log file with filtering ---
    // Use manual listeners to capture data to buffers AND selectively write to logStream
    dockerProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdoutBuffer += chunk; // Always capture to buffer
      if (logStream) {
        logStream.write(chunk); // Write stdout data to log file without filtering
      }
      process.stdout.write(chunk); // Optional: also stream to console for debugging
    });

    dockerProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderrBuffer += chunk; // Always capture to buffer
      if (logStream) {
        // Filter out specific permission errors before writing to log stream
        if (!chunk.includes(filterString)) {
          logStream.write(chunk); // Write to log stream only if not filtered
        }
      }
      process.stderr.write(chunk); // Optional: also stream to console for debugging (shows all output)
    });
    // --- End collect stream data ---


    dockerProcess.on('error', (error) => {
      const errorMsg = `Docker extract process failed to start: ${error.message}`;
      console.error(errorMsg);

      // Write collected buffers and end stream on process error
      // Re-open stream to ensure it's writable before writing final logs
      let finalLogStream: WriteStream | null = null;
      try {
        finalLogStream = createWriteStream(logFilePath, { flags: 'a' });
        finalLogStream.write(`--- Artifact Extraction Started: ${new Date().toISOString()} ---\n`); // Re-add start time
        finalLogStream.write(stdoutBuffer); // Write any stdout captured before the error

        // Filter stderrBuffer before writing to the final log stream on error
        const filteredStderrOnError = stderrBuffer
            .split('\n') // Split into lines
            .filter(line => !line.includes(filterString)) // Filter out lines with the filter string
            .join('\n'); // Join lines back together

        finalLogStream.write(filteredStderrOnError); // Write the filtered stderr buffer
        finalLogStream.write(`\n--- Artifact Extraction Failed: ${new Date().toISOString()} (Process Error) ---\n`);
        finalLogStream.end(); // Explicitly close stream
      } catch (streamErr: any) {
        console.error(`[Build Service] Failed to write extraction process error to log file ${logFilePath}: ${streamErr.message}`);
      }

      reject(new Error(errorMsg));
    });


    dockerProcess.on('close', (code) => {
      console.log(`Docker extract process exited with code ${code}`);

      // Write collected buffers and end stream on process close
      // Re-open stream to ensure it's writable before writing final logs
      let finalLogStream: WriteStream | null = null;
      try {
        finalLogStream = createWriteStream(logFilePath, { flags: 'a' });
        finalLogStream.write(`--- Artifact Extraction Started: ${new Date().toISOString()} ---\n`); // Re-add start time
        finalLogStream.write(stdoutBuffer);

        // Filter stderrBuffer before writing to the final log stream on close
        const filteredStderrOnClose = stderrBuffer
            .split('\n') // Split into lines
            .filter(line => !line.includes(filterString)) // Filter out lines with the filter string
            .join('\n'); // Join lines back together

        finalLogStream.write(filteredStderrOnClose); // Write the filtered stderr buffer

        if (code === 0) {
          finalLogStream.write(`\n--- Artifact Extraction Finished: ${new Date().toISOString()} (Exit Code: ${code}) ---\n`);
        } else {
          finalLogStream.write(`\n--- Artifact Extraction Failed: ${new Date().toISOString()} (Exit Code: ${code}) ---\n`);
        }
        finalLogStream.end(); // Explicitly close stream
      } catch (streamErr: any) {
        console.error(`[Build Service] Failed to write final extraction logs to file ${logFilePath}: ${streamErr.message}`);
      }


      if (code === 0) {
        console.log(`Successfully extracted artifacts from ${imageName} to ${buildOutputPath}`);
        resolve();
      } else {
        console.error(`Docker extract failed for image ${imageName}`);
        const fullErrorDetails = `Docker extract failed.\nCommand: ${cmd} ${args.join(
          ' '
        )}\nExit Code: ${code}\nStdout:\n${stdoutBuffer}\nStderr:\n${stderrBuffer}`; // Use full buffers for error message
        reject(new Error(fullErrorDetails));
      }
    });
  });
}


export { buildProjectImage, extractBuildArtifacts };
