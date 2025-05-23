import simpleGit, { SimpleGit, SimpleGitOptions, GitError } from 'simple-git';
import { PrismaClient } from '@prisma/client';

import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createWriteStream, WriteStream } from 'fs';

const prisma = new PrismaClient();


function getAuthenticatedRepoUrl(repoUrl: string, token: string | null): string {
    if (repoUrl.startsWith('https://github.com/')) {
        return repoUrl.replace('https://github.com/', `https://oauth2:${token}@github.com/`);
    }
    return repoUrl;
}

// get token from gitAccount using prima through userId


async function cloneRepository(repoUrl: string, deploymentId: string,userId:number,  logFilePath: string): Promise<string> {
    const homeDir = os.homedir();
    const cloneDir = path.join(homeDir, '.next-live-clones', `deployment-${deploymentId}-repo`);
    const destinationPath = path.join(cloneDir, 'repository');
    let logStream: WriteStream | null = null;
    
    // Fetch the token from the database or set it to null if not found or any error occurs dont catch the error
    let accessToken: string | null = null;
    const gitAccount = await prisma.gitAccount.findFirst({
      where: {
        userId: userId,
      },
    });
    if (gitAccount) {
      accessToken = gitAccount.accessToken;
    } else {
      throw new Error('Git account not found');
    }
    const authenticatedRepoUrl = getAuthenticatedRepoUrl(repoUrl, accessToken);

    

    try {
        await fs.mkdir(path.dirname(logFilePath), { recursive: true });
        logStream = createWriteStream(logFilePath, { flags: 'a' });
        logStream.write(`--- Git Clone Started: ${new Date().toISOString()} ---\n`);
        logStream.write(`Original URL: ${repoUrl}\n`);
        logStream.write(`Authenticated URL: ${authenticatedRepoUrl}\n`);
        logStream.write(`Using token: ****${accessToken?.slice(-4)}\n`);
    } catch (streamErr: any) {
        console.error(`Failed to create log file: ${streamErr.message}`);
        logStream = null;
    }


    process.env.SIMPLE_GIT_DEBUG = 'true';
    const git: SimpleGit = simpleGit({
        timeout: { block: 6000 }
    });

    try {
        await fs.mkdir(cloneDir, { recursive: true });
        await git.clone(authenticatedRepoUrl, destinationPath);
        
        if (logStream) {
            logStream.write(`Repo cloned successfully\n`);
            logStream.end();
        }
        return destinationPath;
    } catch (error: any) {
        // Error handling remains the same
        throw new Error(`Git clone failed: ${error.message}`);
    }
}

async function cleanUpCloneDirectory(cloneDir: string, logFilePath: string): Promise<void> {
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
            logStream.write(`Clone directory cleaned up successfully: ${cloneDir}\n`);
            logStream.write(`--- Git Cleanup Finished: ${new Date().toISOString()} ---\n`);
            logStream.end();
        }
    } catch (error: any) {
        console.error(`Failed to clean up clone directory ${cloneDir}:`, error);
        if (logStream) {
            logStream.write(`Failed to clean up clone directory ${cloneDir}: ${error.message}\n`);
            logStream.write(`--- Git Cleanup Failed: ${new Date().toISOString()} ---\n`);
            logStream.end();
        }
    }
}

export { cloneRepository, cleanUpCloneDirectory };