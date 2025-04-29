// src/gitService.ts

import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

async function cloneRepository(repoUrl: string, deploymentId: string): Promise<string> {
  const homeDir = os.homedir();
  const cloneDir = path.join(homeDir, '.next-live-clones', `deployment-${deploymentId}-repo`);
  const destinationPath = path.join(cloneDir, 'repository');
  console.log(`Cloning repo from ${repoUrl} to ${destinationPath}`);
  const git = simpleGit();

  try {
    await fs.mkdir(cloneDir, { recursive: true });

    await git.clone(repoUrl, destinationPath);
    console.log(`Repo cloned to ${destinationPath}`);
    return destinationPath
  } catch (error) {
    console.error('Failed cloning repo', error);

    fs.rm(cloneDir, { recursive: true, force: true }).catch(cleanupErr => {
      console.error(`Failed to clean up clone directory ${cloneDir} after clone error:`, cleanupErr);
      });

    throw error;
  }
  
}

async function cleanUpCloneDirectory(cloneBaseDir: string): Promise<void> {
  console.log(`Cleaning up clone directory: ${cloneBaseDir}`);
  try {
      await fs.rm(cloneBaseDir, { recursive: true, force: true });
      console.log(`Clone directory cleaned up successfully.`);
  } catch (error) {
      console.error(`Failed to clean up clone directory ${cloneBaseDir}:`, error);
      // Decide if cleanup failure is critical enough to fail the deployment process
      // For now, just log the error.
  }
}

export { cloneRepository, cleanUpCloneDirectory };