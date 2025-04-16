// src/gitService.ts

import simpleGit from 'simple-git';
import path from 'path';

async function cloneRepository(repoUrl: string, destinationPath: string): Promise<void> {
  const git = simpleGit();
  try {
    await git.clone(repoUrl, destinationPath);
    console.log(`Repo cloned to ${destinationPath}`);
  } catch (error) {
    console.error('Failed cloning repo', error);
    throw error;
  }
}

export { cloneRepository };