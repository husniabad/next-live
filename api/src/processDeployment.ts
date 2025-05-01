// src/processDeployment.ts

import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { cleanUpCloneDirectory, cloneRepository } from './gitService'; // Import gitService functions
import { buildProjectImage, extractBuildArtifacts } from './buildService'; // Import buildService functions
import { startApplication } from './servingService'; // Import servingService function
import { configureNginxForDeployment } from './proxyService'; // Import proxyService function

// Create a new Prisma client instance for the background process.
// This is generally safer than sharing the main resolver's instance
// in long-running async operations, although sharing might work depending on setup.
const prisma = new PrismaClient();


/**
 * Asynchronously processes a deployment task.
 * This function contains the core logic for cloning, building, extracting,
 * starting the application, configuring the proxy, and updating the database status.
 * Errors are caught and logged, and the database status is updated accordingly.
 * This function is intended to be called by the deployment queue worker.
 * @param params Parameters for the deployment process.
 */
async function processDeployment(params: { deploymentId: any; projectId: number; userId: number; gitRepoUrl: string; }) {
    const { deploymentId, projectId, userId, gitRepoUrl } = params;

    console.log(`[Deployment ${deploymentId}] Starting background processing...`);

    // Define working paths (consistent with resolvers)
    // Ensure these paths are appropriate for your WSL2/Linux environment
    const baseDeploymentDir = path.join(__dirname, '..', 'deployments'); // Base path for build outputs
    const deploymentWorkingDir = path.join(baseDeploymentDir, deploymentId.toString()); // Specific dir for build output
    const buildOutputPath = path.join(deploymentWorkingDir, 'build-output'); // Path to store build artifacts

    // Define the base directory for the temporary repository clone within WSL2 home
    // This is the recommended place for Git operations in WSL2
    const wsl2CloneBaseDir = path.join(os.homedir(), `.code-catalyst-clones`, `deployment-${deploymentId}-repo`);
    let clonedRepoPath = ''; // Path where repo is cloned in WSL2 home

    let dockerfileUsed = 'unknown'; // Variable to store which Dockerfile was used
    let deploymentErrorMessage = null; // Variable to store error message on failure


    try {
        // Update status to deploying
        console.log(`[Deployment ${deploymentId}] Updating status to 'deploying'.`);
        await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'deploying' } });

        // Ensure build output directory exists on the host filesystem
         try {
             // This directory needs to be writable by the user running the Node.js process
             await fs.mkdir(deploymentWorkingDir, { recursive: true });
             console.log(`[Deployment ${deploymentId}] Created deployment working directory: ${deploymentWorkingDir}`);
         } catch (dirError: any) {
             console.error(`[Deployment ${deploymentId}] Failed to create deployment working directory: ${dirError.message}`);
             // Re-throw to be caught by the main catch block
             throw new Error(`Failed to prepare deployment workspace: ${dirError.message}`);
         }


        // 1. Clone Repository (into WSL2 home)
        console.log(`[Deployment ${deploymentId}] Cloning ${gitRepoUrl} into WSL2 home.`);
        // cloneRepository should handle creating the necessary parent directories in WSL2 home
        clonedRepoPath = await cloneRepository(gitRepoUrl, deploymentId);
        console.log(`[Deployment ${deploymentId}] Repository cloned successfully to ${clonedRepoPath}.`);

        // 2. Build Docker Image (using cloned repo as context)
        const imageName = `project-${projectId}-${deploymentId}`;
        console.log(`[Deployment ${deploymentId}] Building image: ${imageName} from ${clonedRepoPath}.`);
        // buildProjectImage should return an object like { dockerfileUsed: string }
        const buildResult = await buildProjectImage(clonedRepoPath, imageName);
        dockerfileUsed = buildResult.dockerfileUsed; // Capture which Dockerfile was used
        console.log(`[Deployment ${deploymentId}] Image ${imageName} built successfully (${dockerfileUsed}).`);

        // 3. Artifact Extraction (from image to buildOutputPath)
        console.log(`[Deployment ${deploymentId}] Starting artifact extraction from image ${imageName} to ${buildOutputPath}.`);
        // extractBuildArtifacts copies from the image to the host buildOutputPath
        await extractBuildArtifacts(imageName, buildOutputPath);
        console.log(`[Deployment ${deploymentId}] Artifacts extracted successfully to ${buildOutputPath}.`);

        // Cleanup temporary clone directory in WSL2 home after build/extraction
         console.log(`[Deployment ${deploymentId}] Cleaning up temporary clone directory: ${wsl2CloneBaseDir}`);
         // cleanUpCloneDirectory should handle removing the entire directory created by cloneRepository
         await cleanUpCloneDirectory(wsl2CloneBaseDir);
         console.log(`[Deployment ${deploymentId}] Temporary clone directory cleaned up.`);


        // 4. Start Application (PM2)
        console.log(`[Deployment ${deploymentId}] Starting application from ${buildOutputPath}.`);
        // startApplication should start the process using PM2 and return the internal port
        const { internalPort } = await startApplication(buildOutputPath, deploymentId);
        console.log(`[Deployment ${deploymentId}] Application started on internal port ${internalPort}.`);

        // 5. Configure Reverse Proxy (Nginx)
        // Generate deploymentUrl using userId (passed from resolver) and deploymentId
        const deploymentUrl = `http://deploy-${deploymentId}.${userId}.yourplatform.com`; // Use a consistent subdomain pattern
        console.log(`[Deployment ${deploymentId}] Configuring Nginx. Public URL: ${deploymentUrl}, Internal Port: ${internalPort}.`);
        // configureNginxForDeployment should write the config, create symlink, and reload Nginx (requires sudoers setup)
        await configureNginxForDeployment(deploymentUrl, internalPort, deploymentId, buildOutputPath);
        console.log(`[Deployment ${deploymentId}] Nginx configured successfully.`);


        // Update Deployment Record on Success
        console.log(`[Deployment ${deploymentId}] Processing successful. Updating database record.`);
        await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
                status: 'success',
                buildOutputPath: buildOutputPath, // Store the path to the extracted artifacts
                deploymentUrl: deploymentUrl, // Store the generated public URL
                internalPort: internalPort, // Store the assigned internal port
                dockerfileUsed: dockerfileUsed, // Store which Dockerfile was used
                // version: commitHash, // Add commit hash if captured from git repo
            },
        });
        console.log(`[Deployment ${deploymentId}] Database record updated to 'success'.`);

    } catch (error: any) {
        console.error(`[Deployment ${deploymentId}] Processing failed:`, error.message);
        deploymentErrorMessage = error.message; // Capture the error message

        // Update Deployment Record on Failure
        // Ensure this update doesn't fail itself!
        try {
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: {
                    status: 'failed',
                    dockerfileUsed: dockerfileUsed, // Store which Dockerfile was used even on failure
                    errorMessage: deploymentErrorMessage, // Store the error message
                },
            });
            console.log(`[Deployment ${deploymentId}] Database record updated to 'failed' with error.`);
        } catch (dbError: any) {
            console.error(`[Deployment ${deploymentId}] FATAL: Failed to update database status to 'failed':`, dbError.message);
            // At this point, the deployment failed and we couldn't even record the failure status properly.
            // Manual intervention might be needed.
        }


        // --- Cleanup on Failure ---
        console.log(`[Deployment ${deploymentId}] Initiating cleanup on failure.`);
        // Clean up build output directory on failure
        if (deploymentWorkingDir) { // Ensure path was defined
             fs.rm(deploymentWorkingDir, { recursive: true, force: true }).catch(cleanErr => console.error(`[Deployment ${deploymentId}] Cleanup of build output directory failed on error:`, cleanErr));
        }

         // Clean up temporary clone directory in WSL2 home on failure
         // Check if clonedRepoPath was successfully assigned before attempting cleanup
         if (wsl2CloneBaseDir && clonedRepoPath) { // Ensure paths were defined and cloning started
             console.log(`[Deployment ${deploymentId}] Cleaning up temporary clone directory in WSL2 home on failure: ${wsl2CloneBaseDir}`);
              cleanUpCloneDirectory(wsl2CloneBaseDir).catch(cleanErr => console.error(`[Deployment ${deploymentId}] Cleanup of WSL2 clone directory failed on error:`, cleanErr));
         }
        // TODO: Add cleanup for partially created Docker images or PM2 processes on failure if necessary
        // This can be complex depending on which step failed.

        // No need to re-throw here. The error is handled by updating the database status.
    }
    // The function resolves implicitly on success or finishes after handling the catch.
}

export { processDeployment };
