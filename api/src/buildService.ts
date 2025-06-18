import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs'; // For synchronous checks like existsSync
import { createWriteStream, WriteStream } from 'fs';
import { spawn } from 'child_process';

// Path for the default Dockerfile for Next.js projects WITH output: "standalone"
const DEFAULT_STANDALONE_DOCKERFILE_PATH = path.resolve(
    __dirname, // Assuming buildService.ts is in a directory alongside a 'dockerfiles' folder
    'dockerfiles',
    'Dockerfile.nextjs.standalone.default'
);

// Path for the default Dockerfile for Next.js projects WITHOUT output: "standalone" (classic build)
const DEFAULT_CLASSIC_DOCKERFILE_PATH = path.resolve(
    __dirname,
    'dockerfiles',
    'Dockerfile.nextjs.classic.default'
);

/**
 * Represents the source and type of the Dockerfile used for the build.
 */
export type DockerfileSource =
    | 'user'                     // User-provided Dockerfile in the repository.
    | 'default_standalone'       // Default Dockerfile for Next.js with output: "standalone".
    | 'default_classic'          // Default Dockerfile for classic Next.js builds.
    | 'user_classic_assumed'     // User Dockerfile, but project seems like classic Next.js (hint for start command).
    | 'unknown';                 // Initial state or if source cannot be determined.


/**
 * Builds a Docker image for a given repository.
 * Checks for a user-provided Dockerfile. For Next.js projects without one,
 * it selects a default Dockerfile based on 'output: "standalone"' configuration.
 * @param repoPath The path to the cloned repository.
 * @param imageName The desired name/tag for the Docker image.
 * @param logFilePath Path to log file for appending build logs.
 * @param buildArgs An optional object of build arguments to pass to `docker build`.
 * @returns A promise that resolves with an object indicating which Dockerfile was used.
 * @throws Error if the Docker build fails or required configurations/Dockerfiles are missing.
 */
export async function buildProjectImage(
    repoPath: string,
    imageName: string,
    logFilePath: string,
    buildArgs: { [key: string]: string } = {}
): Promise<{ dockerfileUsed: DockerfileSource }> {
    console.log(`[Build Service] Starting Docker image build for '${imageName}' from '${repoPath}'`);
    console.log(`[Build Service] Appending build logs to: ${logFilePath}`);
    console.log(`[Build Service] Default standalone Dockerfile path: ${DEFAULT_STANDALONE_DOCKERFILE_PATH}`);
    console.log(`[Build Service] Default classic Dockerfile path: ${DEFAULT_CLASSIC_DOCKERFILE_PATH}`);

    let stdoutBuffer = ''; // Buffer for stdout of Docker process
    let stderrBuffer = ''; // Buffer for stderr of Docker process
    let logStream: WriteStream | null = null;

    try {
        // Ensure the directory for the log file exists and create a writable stream
        await fs.mkdir(path.dirname(logFilePath), { recursive: true });
        logStream = createWriteStream(logFilePath, { flags: 'a' }); // Append mode
        logStream.write(`--- Docker Build Started: ${new Date().toISOString()} ---\n`);
        logStream.on('error', (err) => {
            console.error(`[Build Service] Error writing to log file stream ${logFilePath}: ${err.message}`);
        });
    } catch (streamErr: any) {
        console.error(`[Build Service] Failed to create or open log file stream ${logFilePath}: ${streamErr.message}`);
        logStream = null; // Ensure logStream is null if creation failed
    }

    const userDockerfilePath = path.join(repoPath, 'Dockerfile'); // Standard Dockerfile name
    let dockerfilePathToUse = ''; // Path to the Dockerfile that will be used
    let dockerfileSource: DockerfileSource = 'unknown';
    const buildContext = repoPath; // Docker build context is the repository path

    try {
        if (logStream) logStream.write(`--- Dockerfile Detection & Configuration Check Started ---\n`);

        // --- Next.js Project Detection ---
        let isNextProject = false;
        const packageJsonPath = path.join(repoPath, 'package.json');
        const nextConfigJsPath = path.join(repoPath, 'next.config.js');
        const nextConfigMjsPath = path.join(repoPath, 'next.config.mjs');
        const nextConfigTsPath = path.join(repoPath, 'next.config.ts');
        let nextConfigPath: string | null = null; // Path to the found next.config file

        if (fsSync.existsSync(nextConfigJsPath)) {
            isNextProject = true;
            nextConfigPath = nextConfigJsPath;
        } else if (fsSync.existsSync(nextConfigMjsPath)) {
            isNextProject = true;
            nextConfigPath = nextConfigMjsPath;
        } else if (fsSync.existsSync(nextConfigTsPath)) {
            isNextProject = true;
            nextConfigPath = nextConfigTsPath;
        }

        if (nextConfigPath) {
            console.log(`[Build Service] Detected Next.js project via ${path.basename(nextConfigPath)}.`);
            if (logStream) logStream.write(`Detected Next.js project via ${path.basename(nextConfigPath)}.\n`);
        }

        // Fallback: Check package.json if no next.config file found yet
        if (!isNextProject && fsSync.existsSync(packageJsonPath)) {
            try {
                const packageJsonContent = fsSync.readFileSync(packageJsonPath, 'utf8');
                const packageJson = JSON.parse(packageJsonContent);
                if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
                    isNextProject = true;
                    console.log(`[Build Service] Detected potential Next.js project via package.json dependencies.`);
                    if (logStream) logStream.write(`Detected potential Next.js project via package.json dependencies.\n`);
                }
            } catch (error: any) {
                console.warn(`[Build Service] Failed to read or parse package.json at ${packageJsonPath}: ${error.message}`);
                if (logStream) logStream.write(`Warning: Failed to read or parse package.json: ${error.message}\n`);
            }
        }
        // --- End Next.js Project Detection ---


        // --- Dockerfile Selection Logic ---
        console.log(`[Build Service] Checking for user-provided Dockerfile at: ${userDockerfilePath}`);
        if (logStream) logStream.write(`Checking for user-provided Dockerfile at: ${userDockerfilePath}\n`);

        if (fsSync.existsSync(userDockerfilePath)) {
            // User has provided a Dockerfile
            console.log(`[Build Service] User-provided Dockerfile found. Using: ${userDockerfilePath}`);
            if (logStream) logStream.write(`User-provided Dockerfile found.\n`);
            dockerfilePathToUse = userDockerfilePath;

            // If it's a Next.js project, try to guess if it's classic for downstream hints
            if (isNextProject) {
                let isStandaloneUser = false;
                if (nextConfigPath) {
                    try {
                        const configContent = await fs.readFile(nextConfigPath, 'utf8');
                        isStandaloneUser = configContent.toLowerCase().includes('output:') &&
                                         (configContent.includes('"standalone"') ||
                                          configContent.includes("'standalone'") ||
                                          configContent.includes('`standalone`'));
                    } catch { /* ignore error for this check, default to classic assumed */ }
                }
                dockerfileSource = isStandaloneUser ? 'user' : 'user_classic_assumed';
            } else {
                dockerfileSource = 'user'; // Non-Next.js project with user Dockerfile
            }
        } else {
            // No user-provided Dockerfile
            console.log(`[Build Service] No user-provided Dockerfile found. Attempting to use default for Next.js project.`);
            if (logStream) logStream.write(`No user-provided Dockerfile found.\n`);

            if (isNextProject) {
                console.log(`[Build Service] Project identified as Next.js. Selecting appropriate default Dockerfile.`);
                if (logStream) logStream.write(`Project identified as Next.js. Selecting default Dockerfile.\n`);

                let useStandaloneDefaultDockerfile = false;
                if (nextConfigPath) {
                    console.log(`[Build Service] Checking Next.js config file ('${path.basename(nextConfigPath)}') for 'output: "standalone"'.`);
                    if (logStream) logStream.write(`Checking Next.js config file for 'output: "standalone"': ${path.basename(nextConfigPath)}\n`);
                    try {
                        const configContent = await fs.readFile(nextConfigPath, 'utf8');
                        useStandaloneDefaultDockerfile =
                            configContent.toLowerCase().includes('output:') &&
                            (configContent.includes('"standalone"') ||
                             configContent.includes("'standalone'") ||
                             configContent.includes('`standalone`'));

                        if (useStandaloneDefaultDockerfile) {
                            console.log(`[Build Service] Next.js 'output: "standalone"' found in ${path.basename(nextConfigPath)}.`);
                            if (logStream) logStream.write(`Next.js 'output: "standalone"' found.\n`);
                        } else {
                            console.log(`[Build Service] Next.js 'output: "standalone"' NOT found in ${path.basename(nextConfigPath)}. Will use classic build Dockerfile.`);
                            if (logStream) logStream.write(`Next.js 'output: "standalone"' NOT found. Will use classic build Dockerfile.\n`);
                        }
                    } catch (error: any) {
                        const errorMsg = `[Build Service] Failed to read Next.js config file at ${nextConfigPath}: ${error.message}. Assuming classic build for default Dockerfile selection.`;
                        console.warn(errorMsg);
                        if (logStream) logStream.write(`Warning: ${errorMsg}\n`);
                        // Proceed, assuming classic if config is unreadable but project was detected as Next.js
                    }
                } else { // isNextProject is true (likely from package.json) but no next.config.* file found.
                    console.log(`[Build Service] No next.config.js/mjs/ts file found, but package.json indicates Next.js. Assuming classic Next.js build for default Dockerfile selection.`);
                    if (logStream) logStream.write(`No next.config.js/mjs/ts file found. Assuming classic Next.js build.\n`);
                }

                if (useStandaloneDefaultDockerfile) {
                    if (!fsSync.existsSync(DEFAULT_STANDALONE_DOCKERFILE_PATH)) {
                        const errorMsg = `[Build Service] Default Next.js standalone Dockerfile is missing on the server at: ${DEFAULT_STANDALONE_DOCKERFILE_PATH}`;
                        console.error(errorMsg);
                        stderrBuffer += `\n--- Build Configuration Error ---\n${errorMsg}\n`;
                        throw new Error(errorMsg);
                    }
                    console.log(`[Build Service] Using default Next.js standalone Dockerfile: ${DEFAULT_STANDALONE_DOCKERFILE_PATH}`);
                    if (logStream) logStream.write(`Using default Next.js standalone Dockerfile.\n`);
                    dockerfilePathToUse = DEFAULT_STANDALONE_DOCKERFILE_PATH;
                    dockerfileSource = 'default_standalone';
                } else { // This is the path for classic Next.js builds (no output:standalone, or no config file, or unreadable config)
                    if (!fsSync.existsSync(DEFAULT_CLASSIC_DOCKERFILE_PATH)) {
                        const errorMsg = `[Build Service] Default Next.js classic Dockerfile is missing on the server at: ${DEFAULT_CLASSIC_DOCKERFILE_PATH}`;
                        console.error(errorMsg);
                        stderrBuffer += `\n--- Build Configuration Error ---\n${errorMsg}\n`;
                        throw new Error(`${errorMsg}. Please create this Dockerfile to support classic Next.js builds.`);
                    }
                    console.log(`[Build Service] Using default Next.js classic Dockerfile: ${DEFAULT_CLASSIC_DOCKERFILE_PATH}`);
                    if (logStream) logStream.write(`Using default Next.js classic Dockerfile.\n`);
                    dockerfilePathToUse = DEFAULT_CLASSIC_DOCKERFILE_PATH;
                    dockerfileSource = 'default_classic';
                }
            } else {
                // Not detected as a Next.js project and no user Dockerfile provided.
                const errorMsg = `[Build Service] Build failed for ${repoPath}: No Dockerfile found in the repository root, and it could not be identified as a Next.js project for default Dockerfile selection.`;
                console.error(errorMsg);
                stderrBuffer += `\n--- Build Configuration Error ---\n${errorMsg}\n`;
                throw new Error(errorMsg);
            }
        }
        // --- End Dockerfile Selection Logic ---

        if (logStream) logStream.write(`--- Dockerfile Detection & Configuration Check Finished ---\n`);

    } catch (configError: any) {
        console.error('[Build Service] Dockerfile detection or configuration check failed:', configError.message);
        if (logStream) {
            // Write any data buffered *before* the throw
            logStream.write(stdoutBuffer); // Should be empty here usually
            logStream.write(stderrBuffer); // Contains error from detection phase
            logStream.write(`\n--- Docker Build Failed: ${new Date().toISOString()} (Config Error) ---\n`);
            logStream.end(); // Close stream on early config error
        }
        throw configError; // Re-throw the original configuration error
    }

    // --- Proceed with Docker build using spawn ---
    const dockerBuildArgs = ['build', '-t', imageName, '-f', dockerfilePathToUse];
    Object.entries(buildArgs).forEach(([key, value]) => {
        dockerBuildArgs.push('--build-arg', `${key}=${value}`);
    });
    dockerBuildArgs.push(buildContext); // Add context path as the last argument

    console.log(`[Build Service] Executing Docker build command (using spawn): docker ${dockerBuildArgs.join(' ')}`);
    if (logStream) logStream.write(`Executing Docker build command: docker ${dockerBuildArgs.join(' ')}\n`);

    return new Promise((resolve, reject) => {
        const dockerProcess = spawn('docker', dockerBuildArgs, {
            cwd: buildContext, // Set working directory to the build context
            stdio: 'pipe',     // Pipe stdout/stderr to capture
        });

        // Pipe live output to log stream or console
        if (logStream) {
            dockerProcess.stdout.pipe(logStream, { end: false });
            dockerProcess.stderr.pipe(logStream, { end: false });
        } else {
            dockerProcess.stdout.pipe(process.stdout); // Fallback to main process stdout
            dockerProcess.stderr.pipe(process.stderr); // Fallback to main process stderr
        }
        // Also collect into buffers for potential error reporting
        dockerProcess.stdout.on('data', (data) => { stdoutBuffer += data.toString(); });
        dockerProcess.stderr.on('data', (data) => { stderrBuffer += data.toString(); });


        dockerProcess.on('error', (error) => {
            const errorMsg = `[Build Service] Docker build process failed to start: ${error.message}`;
            console.error(errorMsg);
            if (logStream) {
                logStream.write(`\n--- Docker Process Error ---\n${errorMsg}\n`);
                // Write buffered data as a safeguard if piping missed anything or for context
                logStream.write("Stdout before error:\n" + stdoutBuffer);
                logStream.write("Stderr before error:\n" + stderrBuffer);
                logStream.write(`\n--- Docker Build Failed: ${new Date().toISOString()} (Process Error) ---\n`);
                logStream.end(); // Explicitly close stream
            }
            reject(new Error(errorMsg));
        });

        dockerProcess.on('close', (code) => {
            console.log(`[Build Service] Docker build process for '${imageName}' exited with code ${code}`);
            if (logStream) {
                // stdoutBuffer and stderrBuffer already contain the full output due to the 'data' listeners
                if (code === 0) {
                    logStream.write(`\n--- Docker Build Finished Successfully: ${new Date().toISOString()} (Exit Code: ${code}) ---\n`);
                } else {
                    logStream.write(`\n--- Docker Build Failed: ${new Date().toISOString()} (Exit Code: ${code}) ---\n`);
                }
                logStream.end(); // Explicitly close stream
            }

            if (code === 0) {
                console.log(`[Build Service] Successfully built image: ${imageName} (Dockerfile source: ${dockerfileSource}).`);
                resolve({ dockerfileUsed: dockerfileSource });
            } else {
                console.error(`[Build Service] Docker build failed for image ${imageName} (Dockerfile source: ${dockerfileSource}).`);
                const fullErrorDetails = `Docker build failed (Using ${dockerfileSource} Dockerfile).\nCommand: docker ${dockerBuildArgs.join(' ')}\nExit Code: ${code}\nStdout:\n${stdoutBuffer}\nStderr:\n${stderrBuffer}`;
                reject(new Error(fullErrorDetails));
            }
        });
    });
}

/**
 * Runs the built Docker image briefly to extract build artifacts via a volume mount.
 * Assumes the image's runner stage places all necessary artifacts in /app.
 * The chosen Dockerfile (standalone or classic) must ensure /app is correctly populated.
 * @param imageName The name/tag of the built Docker image.
 * @param buildOutputPath The host path where the artifacts should be copied to.
 * @param logFilePath Path to log file for appending extraction logs.
 * @returns A promise that resolves when extraction is complete.
 * @throws Error if the Docker extraction command fails.
 */
export async function extractBuildArtifacts(imageName: string, buildOutputPath: string, logFilePath: string): Promise<void> {
    console.log(`[Build Service] Starting artifact extraction for image '${imageName}' to '${buildOutputPath}'...`);

    let logStream: WriteStream | null = null;
    try {
        await fs.mkdir(path.dirname(logFilePath), { recursive: true }); // Ensure log dir exists
        logStream = createWriteStream(logFilePath, { flags: 'a' });
        logStream.write(`--- Artifact Extraction Started: ${new Date().toISOString()} ---\n`);
        logStream.write(`Attempting to extract from image ${imageName} to ${buildOutputPath}\n`);
        logStream.on('error', (err) => {
            console.error(`[Build Service] Error writing to extraction log file stream ${logFilePath}: ${err.message}`);
        });
    } catch (streamErr: any) {
        console.error(`[Build Service] Failed to create or open log file stream ${logFilePath} for extraction: ${streamErr.message}`);
        logStream = null;
    }

    // Ensure the target output directory exists on the host
    await fs.mkdir(buildOutputPath, { recursive: true });

    return new Promise((resolve, reject) => {
        // Using a more verbose copy command for better debugging if it gets stuck
        const copyCommand = `echo '[Copy Script] Attempting to copy /app contents to /extracted-output. Stand by...' && echo '[Copy Script] Size of /app:' && du -sh /app && echo '[Copy Script] Listing /app contents:' && ls -A /app && echo '[Copy Script] --- Starting verbose copy (cp -vR) ---' && cp -vR /app/. /extracted-output/ && echo '[Copy Script] --- Verbose copy finished ---' || (echo '[Copy Script] Verbose copy attempt (cp -vR) failed or had issues. Trying cp -a.' && cp -a /app/. /extracted-output/) || (echo '[Copy Script] Both cp -vR and cp -a failed. Trying basic cp -R.' && cp -R /app/. /extracted-output/) || echo '[Copy Script] All copy attempts had issues, but continuing due to || true logic.' ; exit 0`;

        const dockerRunArgs = [
            'run',
            '--rm', // Automatically remove the container when it exits
            '-v',
            `${buildOutputPath}:/extracted-output`, // Mount host path to a temp container dir
            imageName, // The image to run (runner stage is default)
            'sh',
            '-c',
            copyCommand, // Use the verbose copy command
        ];

        console.log(`[Build Service] Executing Docker extract command: docker ${dockerRunArgs.join(' ')}`);
        if (logStream) logStream.write(`Executing Docker extract command: docker ${dockerRunArgs.join(' ')}\n`);

        const dockerProcess = spawn('docker', dockerRunArgs, { stdio: 'pipe' });

        let stdoutBuffer = ''; // Capture full stdout for potential error reporting
        let stderrBuffer = ''; // Capture full stderr for potential error reporting

        // Pipe live output and also buffer it
        // if (logStream) {
        //     dockerProcess.stdout.pipe(logStream, { end: false });
        //     dockerProcess.stderr.pipe(logStream, { end: false });
        // } else {
        //     dockerProcess.stdout.pipe(process.stdout);
        //     dockerProcess.stderr.pipe(process.stderr);
        // }
        dockerProcess.stdout.on('data', (data) => { stdoutBuffer += data.toString(); });
        dockerProcess.stderr.on('data', (data) => { stderrBuffer += data.toString(); });


        dockerProcess.on('error', (error) => {
            const errorMsg = `[Build Service] Docker extract process failed to start: ${error.message}`;
            console.error(errorMsg);
            if (logStream) {
                logStream.write(`\n--- Artifact Extraction Failed (Process Error) ---\n${errorMsg}\n`);
                logStream.write("Stdout before error:\n" + stdoutBuffer);
                logStream.write("Stderr before error:\n" + stderrBuffer);
                logStream.end();
            }
            reject(new Error(errorMsg));
        });

        dockerProcess.on('close', (code) => {
            // The copyCommand is designed to `exit 0` via `|| true` logic to prevent `docker run` failing the script here.
            // We rely on the output of the copyCommand itself to understand success/failure of copy.
            console.log(`[Build Service] Docker extract process for '${imageName}' exited with code ${code}.`);
            if (logStream) {
                // stdoutBuffer will contain the echos from the copyCommand
                if (stdoutBuffer.includes("[Copy Script] --- Verbose copy finished ---")) {
                     logStream.write(`\n--- Artifact Extraction Appears Successful (based on copy script output): ${new Date().toISOString()} ---\n`);
                } else {
                     logStream.write(`\n--- Artifact Extraction May Have Had Issues (check copy script output): ${new Date().toISOString()} ---\n`);
                }
                logStream.write(`Docker run exit code: ${code}\n`); // Log the actual exit code of `docker run`
                logStream.end();
            }

            // Due to `exit 0` in copyCommand, `code` will likely be 0.
            // We check the output buffer for success message from our script.
            if (stdoutBuffer.includes("[Copy Script] --- Verbose copy finished ---")) {
                console.log(`[Build Service] Successfully extracted artifacts from ${imageName} to ${buildOutputPath} (based on script output).`);
                resolve();
            } else {
                console.warn(`[Build Service] Artifact extraction from ${imageName} to ${buildOutputPath} may have had issues. Review logs. Docker run exit code: ${code}.`);
                // Decide if this is a hard failure. For now, resolve as the command was designed to pass.
                // If stricter checking is needed, parse stdoutBuffer more carefully or remove `exit 0`.
                resolve();
                // Or, to make it a failure:
                // const fullErrorDetails = `Artifact extraction script reported issues or did not complete successfully.\nCommand: docker ${dockerRunArgs.join(' ')}\nExit Code: ${code}\nStdout:\n${stdoutBuffer}\nStderr:\n${stderrBuffer}`;
                // reject(new Error(fullErrorDetails));
            }
        });
    });
}

/*
Reminder: Ensure you have the following Dockerfiles in your './dockerfiles/' directory:
1. Dockerfile.nextjs.standalone.default
   - For Next.js projects with `output: "standalone"`.
   - Should build the app and copy the `./next/standalone` and `./next/static` folders.
   - CMD ["node", "server.js"]

2. Dockerfile.nextjs.classic.default
   - For Next.js projects without `output: "standalone"`.
   - Should build the app (`next build`).
   - The runner stage should copy `.next`, `public`, `package.json`, and `node_modules`.
   - CMD ["node_modules/.bin/next", "start"] or similar (e.g., "npm", "run", "start")
*/
