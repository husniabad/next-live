// src/gitService.ts

import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createWriteStream, WriteStream } from 'fs';

async function cloneRepository(repoUrl: string, deploymentId: string , logFilePath:string): Promise<string> {
  const homeDir = os.homedir(); // temporary directory for cloning
  const cloneDir = path.join(homeDir, '.next-live-clones', `deployment-${deploymentId}-repo`);
  const destinationPath = path.join(cloneDir, 'repository');
  let logStream: WriteStream | null = null;
    try {
      await fs.mkdir(path.dirname(logFilePath), { recursive: true });
      logStream = createWriteStream(logFilePath, { flags: 'a' });

      logStream.write(`--- Git Clone Started: ${new Date().toISOString()} ---\n`); // LOGS
      logStream.write(`Attempting to clone repo from ${repoUrl} to ${destinationPath}\n`); // LOGS
    } catch (streamErr: any) {
      console.error(
        `[Build Service] Failed to create or open log file stream ${logFilePath}: ${streamErr.message}`
      );
      // Decide if this error should stop the deployment. For now, we'll log and continue without logging to file.
      logStream = null; // Ensure logStream is null if creation failed
    }
  console.log(`Cloning repo from ${repoUrl} to ${destinationPath}`);
  const git = simpleGit();

  try {
    if (logStream) logStream.write(`Ensuring clone directory exists: ${cloneDir}\n`);
    await fs.mkdir(cloneDir, { recursive: true });
    if (logStream) logStream.write(`Clone directory ensured.\n`); // LOGS

    if (logStream) logStream.write(`Executing git clone...\n`);  // LOGS
    await git.clone(repoUrl, destinationPath);
    if(logStream) {
      logStream.write(`Repo cloned successfully to ${destinationPath}\n`); // LOGS
      logStream.write(`--- Git Clone Finished: ${new Date().toISOString()} ---\n`); // LOGS
      logStream.end(); // Close the log stream after cloning
    }
    console.log(`Repo cloned to ${destinationPath}`);
    return destinationPath
  } catch (error:any) {
    console.error('Failed cloning repo', error);

    if(logStream) {
      logStream.write(`Failed to clone repo: ${error.message}\n`); 
      logStream.write(`--- Git Clone Failed: ${new Date().toISOString()} ---\n`);
      logStream.write(`Initiating cleanup of clone directory: ${cloneDir}\n`);
      logStream.end(); 
  }
    // fs.rm(cloneDir, { recursive: true, force: true }).catch(cleanupErr => {
    //   console.error(`Failed to clean up clone directory ${cloneDir} after clone error:`, cleanupErr);
    //   }); // Note: Cleanup happens in another function

    throw error;
  }
  
}

async function cleanUpCloneDirectory(cloneDir: string, logFilePath:string): Promise<void> {
  console.log(`Cleaning up clone directory: ${cloneDir}`);
  let logStream: WriteStream | null = null;
    try {
        await fs.mkdir(path.dirname(logFilePath), { recursive: true });
        logStream = createWriteStream(logFilePath, { flags: 'a' });
        logStream.write(`--- Git Cleanup Started: ${new Date().toISOString()} ---\n`); 
        logStream.write(`Attempting to clean up clone directory: ${cloneDir}\n`); 
    } catch (streamErr: any) {
        console.error(
            `[Git Service] Failed to create or open log file stream ${logFilePath} for cleanup: ${streamErr.message}`
        );
        logStream = null; 
    }

  try {
      await fs.rm(cloneDir, { recursive: true, force: true });
      console.log(`Clone directory cleaned up successfully.`);
      if (logStream) {
        logStream.write(`Clone directory cleaned up successfully: ${cloneDir}\n`); // LOGS
        logStream.write(`--- Git Cleanup Finished: ${new Date().toISOString()} ---\n`); // LOGS
        logStream.end(); // Close stream on success
    }
  } catch (error:any) {
      console.error(`Failed to clean up clone directory ${cloneDir}:`, error);
      if (logStream) {
        logStream.write(`Failed to clean up clone directory ${cloneDir}: ${error.message}\n`); // LOGS
        logStream.write(`--- Git Cleanup Failed: ${new Date().toISOString()} ---\n`); // LOGS
        logStream.end(); // Close stream on error
    }
      // Decide if cleanup failure is critical enough to fail the deployment process
      // For now, just log the error.
  }
}

export { cloneRepository, cleanUpCloneDirectory };