// src/buildService.ts

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises'; // Use promises version for async file operations
import fsSync from 'fs'; // Use sync version for existsSync

// Assuming the default Dockerfile is located here relative to the built JS file
// Corrected path calculation based on previous debugging: assuming dockerfiles is sibling of api
const DEFAULT_DOCKERFILE_PATH = path.resolve(__dirname, 'dockerfiles', 'Dockerfile.nextjs.default');


/**
 * Builds a Docker image for a given repository.
 * Checks for a user-provided Dockerfile or uses a default for Next.js projects.
 * Validates Next.js projects for standalone output configuration when using the default Dockerfile.
 * @param repoPath The path to the cloned repository.
 * @param imageName The desired name/tag for the Docker image.
 * @param buildArgs An optional object of build arguments to pass (e.g., { NEXT_PUBLIC_API_URL: '...' }).
 * @returns A promise that resolves when the build is complete, or rejects on failure.
 */
async function buildProjectImage(repoPath: string, imageName: string, buildArgs: { [key: string]: string } = {}): Promise<void> {
    console.log("Resolved default Dockerfile path:", DEFAULT_DOCKERFILE_PATH);

    const userDockerfilePath = path.join(repoPath, 'Dockerfile'); // Standard Dockerfile name
    let dockerfilePathToUse = '';
    let isUsingDefault = false;
    const buildContext = repoPath; // The directory containing the Dockerfile and code

    console.log(`Checking for user-provided Dockerfile at: ${userDockerfilePath}`);

    if (fsSync.existsSync(userDockerfilePath)) {
        console.log(`User-provided Dockerfile found. Using: ${userDockerfilePath}`);
        dockerfilePathToUse = userDockerfilePath;
        // If user provides Dockerfile, we assume they handle the build process correctly
        // No automatic next.config check or modification is done.

    } else {
        // No user Dockerfile, proceed with Next.js detection and default Dockerfile logic

        // Check if the required default Dockerfile actually exists on the filesystem
        // This is a server configuration check, should ideally pass.
        if (!fsSync.existsSync(DEFAULT_DOCKERFILE_PATH)) {
             console.error(`FATAL: Default Next.js Dockerfile not found at expected path: ${DEFAULT_DOCKERFILE_PATH}`);
             // Fail the build with a server configuration error
             return Promise.reject(new Error(`Configuration error: Default Next.js Dockerfile is missing on the build server at ${DEFAULT_DOCKERFILE_PATH}.`));
        }


        console.log(`User Dockerfile not found. Checking for Next.js project and configuration...`);

        // --- Next.js Detection and Config Check Logic ---
        let isNextProject = false;
        const packageJsonPath = path.join(repoPath, 'package.json');
        const nextConfigJsPath = path.join(repoPath, 'next.config.js');
        const nextConfigMjsPath = path.join(repoPath, 'next.config.mjs');
        const nextConfigTsPath = path.join(repoPath, 'next.config.ts');

        let nextConfigPath = null; // Path to the found next.config file

        // 1. Check for standard next.config file existence first
        if (fsSync.existsSync(nextConfigJsPath)) {
            isNextProject = true;
            nextConfigPath = nextConfigJsPath;
            console.log(`Detected Next.js project via next.config.js file.`);
        } else if (fsSync.existsSync(nextConfigMjsPath)) {
             isNextProject = true;
             nextConfigPath = nextConfigMjsPath;
             console.log(`Detected Next.js project via next.config.mjs file.`);
        } else if (fsSync.existsSync(nextConfigTsPath)) {
             isNextProject = true;
             nextConfigPath = nextConfigTsPath;
             console.log(`Detected Next.js project via next.config.ts file.`);
        }

        // 2. Fallback check via package.json if no next.config file found yet
        if (!isNextProject && fsSync.existsSync(packageJsonPath)) {
            try {
                const packageJsonContent = fsSync.readFileSync(packageJsonPath, 'utf8');
                const packageJson = JSON.parse(packageJsonContent);
                if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
                   isNextProject = true; // It is likely a Next.js project
                   console.log(`Detected potential Next.js project via package.json dependencies.`);
                }
            } catch (error: any) {
                console.warn(`Failed to read or parse package.json at ${packageJsonPath}: ${error.message}`);
                // Continue without this check if package.json is invalid
            }
        }
        // --- End Detection Logic ---


        if (isNextProject) {
            // If it's a Next.js project and we're using the default Dockerfile,
            // we *require* the "standalone" output configuration.

            if (nextConfigPath) {
                 // --- Check for "standalone" output in the found config file ---
                 try {
                     const configContent = await fs.readFile(nextConfigPath, 'utf8');
                     // Perform a basic case-insensitive string search for the required configuration
                     // This is NOT foolproof (won't handle complex JS logic) but covers common cases.
                     const isStandalone = configContent.toLowerCase().includes('output:') &&
                                          (configContent.includes('"standalone"') || // Check for double quotes
                                           configContent.includes("'standalone'") || // Check for single quotes
                                           configContent.includes("`standalone`")); // Check for backticks


                     if (!isStandalone) {
                         console.error(`Next.js configuration check failed: '${path.basename(nextConfigPath)}' does not contain 'output: "standalone"' or similar required for the default build.`);
                         // Fail the build and instruct the user
                         return Promise.reject(new Error(`Next.js build configuration error: Please add 'output: "standalone",' to your ${path.basename(nextConfigPath)} file in the repository root to use the default build process.`));
                     }
                     console.log(`Next.js configuration check passed: 'output: "standalone"' or similar found in ${path.basename(nextConfigPath)}.`);

                 } catch (error: any) {
                      console.error(`Failed to read or check Next.js config file at ${nextConfigPath}: ${error.message}`);
                      // Fail the build if the config file cannot be read/checked
                      return Promise.reject(new Error(`Failed to read or check Next.js configuration file at ${path.basename(nextConfigPath)}: ${error.message}`));
                 }
                 // --- End Check ---

            } else {
                 // Project detected as Next.js (via package.json) but no next.config.* file found.
                 // The default Dockerfile assumes a standard setup, which includes next.config.* and standalone output.
                 // We cannot automatically configure 'output: "standalone"' without a config file.
                 console.error(`Next.js configuration check failed: Project detected, but no next.config.js/mjs/ts found in repository root.`);
                 return Promise.reject(new Error(`Next.js configuration error: Project detected, but no Next.js configuration file found. Please add a 'next.config.js', 'next.config.mjs', or 'next.config.ts' file with 'output: "standalone",' to your repository root.`));
            }

            // If we reached here, it's a Next.js project and the config check passed (or wasn't applicable because user provided Dockerfile)
            console.log(`Using default Next.js Dockerfile: ${DEFAULT_DOCKERFILE_PATH}`);
            dockerfilePathToUse = DEFAULT_DOCKERFILE_PATH;
            isUsingDefault = true;

        } else {
            // Not detected as a Next.js project and no user Dockerfile provided.
            console.error(`Build failed for ${repoPath}: No Dockerfile found in the repository root, and it could not be identified as a Next.js project.`);
            return Promise.reject(new Error(`Build failed: No Dockerfile found in repository root (${userDockerfilePath}) and automatic Next.js project detection failed. Please provide a Dockerfile or ensure it's a standard Next.js project.`));
        }
        // --- End Next.js Detection and Config Check Logic ---
    }

    // --- Proceed with Docker build using spawn ---
    const args = [
        'build',
        '-t', imageName,
        '-f', dockerfilePathToUse, // Pass path as a separate argument
    ];

    Object.entries(buildArgs).forEach(([key, value]) => {
        args.push('--build-arg', `${key}=${value}`);
    });

    args.push(buildContext); // Add context path as the last argument

    console.log(`Executing Docker build command (using spawn): docker ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
        const dockerProcess = spawn('docker', args, {
            cwd: repoPath, // Set working directory to the build context (optional, but good practice)
            stdio: 'pipe' // Pipe stdout/stderr to capture
        });

        let stdout = '';
        let stderr = '';

        dockerProcess.stdout.on('data', (data) => {
            stdout += data.toString();
            process.stdout.write(data); // Stream output to console
        });

        dockerProcess.stderr.on('data', (data) => {
            stderr += data.toString();
            process.stderr.write(data); // Stream output to console
        });

        dockerProcess.on('error', (error) => {
             console.error(`Docker process failed to start: ${error.message}`);
             reject(new Error(`Docker process failed to start: ${error.message}`));
        });


        dockerProcess.on('close', (code) => {
            console.log(`Docker build process exited with code ${code}`);
            if (code === 0) {
                console.log(`Successfully built image: ${imageName}`);
                resolve();
            } else {
                console.error(`Docker build failed for image ${imageName}`);
                const fullErrorDetails = `Docker build failed (Using ${isUsingDefault ? 'default' : 'user'} Dockerfile).\nCommand: docker ${args.join(' ')}\nExit Code: ${code}\nStdout:\n${stdout}\nStderr:\n${stderr}`;
                reject(new Error(fullErrorDetails));
            }
        });
    });
}

// ... (extractBuildArtifacts function remains the same) ...
/**
 * Runs the built Docker image briefly to extract build artifacts via a volume mount.
 * Assumes the image was built to place artifacts in /app/out.
 * @param imageName The name/tag of the built Docker image.
 * @param buildOutputPath The host path where the artifacts should be copied to.
 * @returns A promise that resolves when extraction is complete.
 */
async function extractBuildArtifacts(imageName: string, buildOutputPath: string): Promise<void> {
     // Ensure the target output directory exists on the host
    await fs.mkdir(buildOutputPath, { recursive: true }); // Use async version

    return new Promise((resolve, reject) => {
        // Command and arguments for spawn
        const cmd = 'docker';
        const args = [
            'run',
            '--rm', // Automatically remove the container when it exits
            '-v', `${buildOutputPath}:/extracted-output`, // Mount host path to a temp container dir
            imageName, // The image (the runner stage is the default)
            'sh', '-c', // Use sh to run the copy command
            // --- CORRECTED COPY COMMAND ---
            // Copy everything from the runner stage's WORKDIR (/app) to the mounted volume path (/extracted-output)
            // The trailing /. on the source copies the *contents* of /app rather than /app itself.
            `cp -R /app/. /extracted-output/`
            // --- End CORRECTED COPY COMMAND ---
        ];



        console.log(`Executing Docker extract command (using spawn): ${cmd} ${args.join(' ')}`);

        const dockerProcess = spawn(cmd, args, {
             stdio: 'pipe' // Pipe stdout/stderr
        });

         let stdout = '';
         let stderr = '';

         dockerProcess.stdout.on('data', (data) => {
             stdout += data.toString();
             process.stdout.write(data); // Stream output
         });

         dockerProcess.stderr.on('data', (data) => {
             stderr += data.toString();
             process.stderr.write(data); // Stream output
         });

         dockerProcess.on('error', (error) => {
              console.error(`Docker extract process failed to start: ${error.message}`);
              reject(new Error(`Docker extract process failed to start: ${error.message}`));
         });


         dockerProcess.on('close', (code) => {
             console.log(`Docker extract process exited with code ${code}`);
             if (code === 0) {
                 console.log(`Successfully extracted artifacts from ${imageName} to ${buildOutputPath}`);
                 resolve();
             } else {
                 console.error(`Docker extract failed for image ${imageName}`);
                 const fullErrorDetails = `Docker extract failed.\nCommand: ${cmd} ${args.join(' ')}\nExit Code: ${code}\nStdout:\n${stdout}\nStderr:\n${stderr}`;
                 reject(new Error(fullErrorDetails));
             }
         });
    });
}

export { buildProjectImage, extractBuildArtifacts };