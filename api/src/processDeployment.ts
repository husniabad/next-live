import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { cleanUpCloneDirectory, cloneRepository } from './gitService'; // Assuming these are in gitService.ts
import { buildProjectImage, extractBuildArtifacts, DockerfileSource } from './buildService'; // buildService.ts
import { startApplication } from './servingService'; // servingService.ts
import { configureNginxForDeployment } from './proxyService'; // proxyService.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { sanitizeForSubdomain } from './utils';

const execPromise = promisify(exec);

// Create a new Prisma client instance.
const prisma = new PrismaClient();

// YOUR_PLATFORM_URL should be set in your environment variables for production
// e.g., YOUR_PLATFORM_URL='nextlivenow.app'
// If it's not set, the script assumes a development environment.
const yourPlatformUrl = process.env.YOUR_PLATFORM_URL || null;

/**
 * Asynchronously processes a deployment task.
 * This function contains the core logic for cloning, building, extracting,
 * starting the application, configuring the proxy (if in production),
 * and updating the database status.
 * @param params Parameters for the deployment process.
 */
async function processDeployment(params: {
    deploymentId: any;
    projectId: number;
    userId: number;
    gitRepoUrl: string;
    // buildArgs?: { [key: string]: string }; // Optional: Pass build arguments if needed
}) {
    const { deploymentId, projectId, userId, gitRepoUrl /*, buildArgs = {} */ } = params;

    console.log(`[Deployment ${deploymentId}] Starting background processing...`);
    console.log(`[Deployment ${deploymentId}] YOUR_PLATFORM_URL: '${yourPlatformUrl}' (Production mode if set)`);

    // Define working paths
    const baseDeploymentDir = path.join(__dirname, '..', 'deployments'); // Base path for all deployments
    const deploymentWorkingDir = path.join(baseDeploymentDir, deploymentId.toString()); // Specific dir for this deployment
    const buildOutputPath = path.join(deploymentWorkingDir, 'build-output'); // Extracted artifacts go here

    const logFileName = `deployment-${deploymentId}.log`;
    const logFilePath = path.join(deploymentWorkingDir, logFileName); // Central log file for this deployment
    console.log(`[Deployment ${deploymentId}] Log file will be at: ${logFilePath}`);

    // Define the base directory for the temporary repository clone
    const wsl2CloneBaseDir = path.join(os.homedir(), `.code-catalyst-clones`, `deployment-${deploymentId}-repo`);
    let clonedRepoPath = ''; // Path where repo is actually cloned

    let dockerfileUsedResult: DockerfileSource = 'unknown';
    let deploymentErrorMessage: string | null = null;
    let finalDeploymentUrl = ''; // URL to be stored, either production or local
    let internalPort: number | null = null; // Port the application runs on internally

    try {
        // Update status to 'deploying' in the database
        console.log(`[Deployment ${deploymentId}] Updating status to 'deploying'.`);
        await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
                status: 'deploying',
                logFilePath: logFilePath, // Store log file path
            }
        });

        // Prepare deployment workspace (create directories, set permissions)
        try {
            await fs.mkdir(deploymentWorkingDir, { recursive: true });
            console.log(`[Deployment ${deploymentId}] Created deployment working directory: ${deploymentWorkingDir}`);
            await fs.mkdir(buildOutputPath, { recursive: true });
            console.log(`[Deployment ${deploymentId}] Created build output directory: ${buildOutputPath}`);

            // Change ownership of the build-output directory.
            // This is important if the user inside the Docker container or PM2 process needs specific permissions.
            console.log(`[Deployment ${deploymentId}] Attempting to change ownership of ${buildOutputPath} to UID 1001.`);
            const { stdout, stderr } = await execPromise(`sudo chown -R 1001:1001 ${buildOutputPath}`);
            if (stdout) console.log(`[Deployment ${deploymentId}] chown stdout: ${stdout}`);
            if (stderr) console.warn(`[Deployment ${deploymentId}] chown stderr: ${stderr}`); // Log warning, but don't fail
            console.log(`[Deployment ${deploymentId}] Ownership change command executed.`);
        } catch (dirError: any) {
            console.error(`[Deployment ${deploymentId}] Failed to prepare deployment workspace or change ownership: ${dirError.message}`);
            throw new Error(`Failed to prepare deployment workspace or change ownership: ${dirError.message}`);
        }

        // 1. Clone Repository
        console.log(`[Deployment ${deploymentId}] Cloning ${gitRepoUrl} into ${wsl2CloneBaseDir}.`);
        clonedRepoPath = await cloneRepository(gitRepoUrl, deploymentId, userId, logFilePath);
        console.log(`[Deployment ${deploymentId}] Repository cloned successfully to ${clonedRepoPath}.`);

        // 2. Build Docker Image
        const imageName = `project-${projectId}-${deploymentId}`;
        console.log(`[Deployment ${deploymentId}] Building image: ${imageName} from ${clonedRepoPath}.`);
        // Pass any necessary build arguments if they are part of `params` or fetched elsewhere
        const projectBuildArgs = { /* EXAMPLE_VAR: 'example_value' */ };
        const buildResult = await buildProjectImage(clonedRepoPath, imageName, logFilePath, projectBuildArgs);
        dockerfileUsedResult = buildResult.dockerfileUsed;
        console.log(`[Deployment ${deploymentId}] Image ${imageName} built successfully (Dockerfile source: ${dockerfileUsedResult}).`);

        // 3. Artifact Extraction
        console.log(`[Deployment ${deploymentId}] Starting artifact extraction from image ${imageName} to ${buildOutputPath}.`);
        await extractBuildArtifacts(imageName, buildOutputPath, logFilePath);
        console.log(`[Deployment ${deploymentId}] Artifacts extracted successfully to ${buildOutputPath}.`);

        // Cleanup temporary clone directory
        console.log(`[Deployment ${deploymentId}] Cleaning up temporary clone directory: ${wsl2CloneBaseDir}`);
        await cleanUpCloneDirectory(wsl2CloneBaseDir, logFilePath);
        console.log(`[Deployment ${deploymentId}] Temporary clone directory cleaned up.`);

        // 4. Start Application (PM2)
        console.log(`[Deployment ${deploymentId}] Determining build type for application start.`);
        const buildType = (dockerfileUsedResult === 'default_classic' || dockerfileUsedResult === 'user_classic_assumed') ? 'classic' : 'standalone';
        console.log(`[Deployment ${deploymentId}] Starting application from ${buildOutputPath} (Build type: ${buildType}).`);
        const appStartResult = await startApplication(buildOutputPath, deploymentId, { buildType: buildType });
        internalPort = appStartResult.internalPort; // Capture the internal port
        console.log(`[Deployment ${deploymentId}] Application started successfully on internal port ${internalPort}.`);

        const project = await prisma.project.findUnique({ where: {id: projectId}, include: { user: {select: {username: true }} }});
        const user = project?.user || 'user';
        const projectName = project?.name ?? `project-${projectId}`; // Fallback to project ID if name is not available
        // const username = user?.git || 'unknown'; 
        let finalDeploymentUrl = '';
        let generatedHostname = ''; // This will be passed to Nginx configuration
        const isProduction = !!yourPlatformUrl; // True if yourPlatformUrl is set and not an empty string

        if (isProduction && yourPlatformUrl && internalPort) {
            const sanitizedProjectName = sanitizeForSubdomain(projectName);
            const sanitizedUsername = sanitizeForSubdomain("username");
            const baseSubdomainPart = `${sanitizedProjectName}`.replace(/-$/, ''); // -${sanitizedUsername} Avoid trailing hyphen if one part is empty
 
            let attempt = 0;
            const MAX_URL_GENERATION_ATTEMPTS = 5; // Max attempts to find a unique URL

            while (attempt < MAX_URL_GENERATION_ATTEMPTS) {
                const randomString = Math.random().toString(36).substring(2, 7); // 5 random alphanumeric chars
                const proposedSubdomain = `${baseSubdomainPart}-${randomString}`;

                generatedHostname = `${proposedSubdomain}.${yourPlatformUrl}`;
                const potentialOperationalUrl = `https://${generatedHostname}`;

                // Check if this URL already exists for an active deployment
                const existingDeployment = await prisma.deployment.findFirst({
                    where: {
                        deploymentUrl: potentialOperationalUrl,
                        status: { in: ['success', 'deploying'] }, // Check active ones
                        // NOT: { id: deploymentId } // Not needed here, as we are generating for the current new deploymentId
                    }
                });

                if (!existingDeployment) {
                    finalDeploymentUrl = potentialOperationalUrl; // Unique URL found
                    break;
                }
                console.warn(`[Deployment ${deploymentId}] Generated URL <span class="math-inline">\{potentialOperationalUrl\} already exists\. Retrying \(</span>{attempt + 1}/${MAX_URL_GENERATION_ATTEMPTS})...`);
                attempt++;
            }

            
            if (!finalDeploymentUrl) {
                // Fallback if unique URL couldn't be generated with the pattern
                console.warn(`[Deployment ${deploymentId}] Could not generate unique URL with pattern after ${MAX_URL_GENERATION_ATTEMPTS} attempts. Falling back to deploy-ID pattern.`);
                const fallbackSubdomain = `deploy-${deploymentId}`; // Default, highly likely to be unique
                generatedHostname = `${fallbackSubdomain}.${yourPlatformUrl}`;
                finalDeploymentUrl = `https://${generatedHostname}`;

                // Final check for the fallback (should almost never collide)
                const fallbackCollision = await prisma.deployment.findFirst({
                    where: { deploymentUrl: finalDeploymentUrl, status: { in: ['success', 'deploying'] } }
                });
                if (fallbackCollision) {
                    console.error(`[Deployment ${deploymentId}] FATAL: Fallback URL ${finalDeploymentUrl} also collided. This should not happen.`);
                    throw new Error(`Failed to generate a unique deployment URL even with fallback pattern.`);
                }
            }
            console.log(`[Deployment ${deploymentId}] Final generated production URL: ${finalDeploymentUrl}`);


 
            // finalDeploymentUrl = `https://deploy-${deploymentId}.${yourPlatformUrl}`; // HTTPS for production
            // console.log(`[Deployment ${deploymentId}] Production mode detected. Configuring Nginx.`);
            // console.log(`[Deployment ${deploymentId}] Public URL will be: ${finalDeploymentUrl}`);
            // await configureNginxForDeployment(finalDeploymentUrl, internalPort, deploymentId, buildOutputPath, logFilePath, true); // true for useHttps
            // console.log(`[Deployment ${deploymentId}] Nginx configured successfully for production environment.`);
        } else if (internalPort) {
            // Development environment (YOUR_PLATFORM_URL not set): Use localhost URL and skip Nginx
            finalDeploymentUrl = `http://localhost:${internalPort}`;
            console.log(`[Deployment ${deploymentId}] Development mode detected (YOUR_PLATFORM_URL not set).`);
            console.log(`[Deployment ${deploymentId}] Application accessible at: ${finalDeploymentUrl}. Skipping Nginx configuration.`);
        } else {
            // This case should ideally not be reached if startApplication is successful
            console.error(`[Deployment ${deploymentId}] Internal port not obtained. Cannot determine deployment URL.`);
            throw new Error("Internal port not available after application start.");
        }

        await prisma.deployment.update({ where: { id: deploymentId }, data: { deploymentUrl: finalDeploymentUrl} });
        if (isProduction) {
        await configureNginxForDeployment(finalDeploymentUrl, internalPort, deploymentId, buildOutputPath, logFilePath, true); 
        }

        // Update Deployment Record on Success
        console.log(`[Deployment ${deploymentId}] Processing successful. Updating database record.`);
        await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
                status: 'success',
                buildOutputPath: buildOutputPath,
                deploymentUrl: finalDeploymentUrl, // Store the final URL
                internalPort: internalPort,
                dockerfileUsed: dockerfileUsedResult,
            },
        });
        console.log(`[Deployment ${deploymentId}] Database record updated to 'success'. Deployment URL: ${finalDeploymentUrl}`);

    } catch (error: any) {
        console.error(`[Deployment ${deploymentId}] Processing failed:`, error.message, error.stack);
        deploymentErrorMessage = error.message; // Capture the error message

        // Update Deployment Record on Failure
        try {
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: {
                    status: 'failed',
                    dockerfileUsed: dockerfileUsedResult, // Store which Dockerfile was attempted
                    errorMessage: deploymentErrorMessage,
                    deploymentUrl: finalDeploymentUrl || undefined, // Store URL if available
                    internalPort: internalPort || undefined,
                },
            });
            console.log(`[Deployment ${deploymentId}] Database record updated to 'failed' with error.`);
        } catch (dbError: any) {
            console.error(`[Deployment ${deploymentId}] FATAL: Failed to update database status to 'failed':`, dbError.message);
        }

        // Cleanup on Failure
        console.log(`[Deployment ${deploymentId}] Initiating cleanup due to failure.`);
        if (deploymentWorkingDir) {
            fs.rm(deploymentWorkingDir, { recursive: true, force: true })
              .then(() => console.log(`[Deployment ${deploymentId}] Cleaned up deployment working directory: ${deploymentWorkingDir}`))
              .catch(cleanErr => console.error(`[Deployment ${deploymentId}] Cleanup of deployment working directory failed:`, cleanErr));
        }
        if (wsl2CloneBaseDir && clonedRepoPath) { // clonedRepoPath implies wsl2CloneBaseDir was used
            console.log(`[Deployment ${deploymentId}] Cleaning up temporary clone directory: ${wsl2CloneBaseDir}`);
            cleanUpCloneDirectory(wsl2CloneBaseDir, logFilePath)
              .catch(cleanErr => console.error(`[Deployment ${deploymentId}] Cleanup of WSL2 clone directory failed:`, cleanErr));
        }
        // TODO: Consider cleanup for Docker images (`docker rmi ...`) and PM2 processes (`pm2 delete ...`) on failure.
    }
}

export { processDeployment };
