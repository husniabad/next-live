// src/resolvers.ts

import { PrismaClient } from '@prisma/client';
import path from 'path';
import { cleanUpCloneDirectory, cloneRepository } from './gitService';
import { buildProjectImage, extractBuildArtifacts } from './buildService';
import { startApplication } from './servingService';
import { configureNginxForDeployment } from './proxyService';
import jwt from 'jsonwebtoken';
import { URL } from 'url';
import axios from 'axios';
import fs from 'fs/promises';
import os from 'os';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
// const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// interface CreateProjectArgs {
//   name: string;
//   gitRepoUrl: string;
//   userId: number;
// }

const resolvers = {
  Query: {
    projects: async () => {
      return prisma.project.findMany();
    },
    project: async (_: any, { id }: { id: number }) => {
      return prisma.project.findUnique({ where: { id } });
    },
    me: async (_: any, __: any, { userId }: any) => {
      if (!userId) return null;
      return prisma.user.findUnique({ where: { id: userId } });
    },
    repositories: async (_: any, __: any, { userId }: any) => {
      if (!userId) {
        throw new Error('Not authenticated.');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { gitAccounts: true },
      });

      const githubAccount = user?.gitAccounts.find(
        (account) => account.provider === 'github' && account.accessToken
      );

      if (!githubAccount?.accessToken) {
        throw new Error('No GitHub access token found for this user.');
      }

      try {
        const response = await axios.get('https://api.github.com/user/repos', {
          headers: {
            Authorization: `Bearer ${githubAccount.accessToken}`,
          },
        });
        console.log('repos:', response);
        return response.data.map((repo: any) => ({
          name: repo.name,
          html_url: repo.html_url,
          // Map other relevant fields
        }));
      } catch (error: any) {
        console.error('Error fetching GitHub repos:', error.message);
        throw new Error('Failed to fetch GitHub repositories.');
      }
    },
  },
  Mutation: {
    loginGit: async (_: any, { provider, code }: any) => {
      console.log('provider', provider, '\ncode', code);

      let accessToken: string | null = null;
      let providerUserId: string | null = null;
      let username: string | null = null;
      let email: string | null = null; // GitHub also provides email

      if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        throw new Error(
          'GitHub Client ID or Secret not configured on the server.'
        );
      }

      if (provider === 'github') {
        try {
          const response = await axios.post(
            'https://github.com/login/oauth/access_token',
            {
              client_id: GITHUB_CLIENT_ID,
              client_secret: GITHUB_CLIENT_SECRET,
              code,
            },
            { headers: { Accept: 'application/json' } }
          );

          const params = new URLSearchParams(response.data);

          accessToken = params.get('access_token');

          if (accessToken) {
            const userInfoResponse = await axios.get(
              'https://api.github.com/user',
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
            providerUserId = userInfoResponse.data.id.toString();
            username = userInfoResponse.data.login;
            email = userInfoResponse.data.email; // May be null if not public

            // Optionally fetch emails if the primary email is private
            // if (!email) {
            //   const emailsResponse = await axios.get('https://api.github.com/user/emails', {
            //     headers: { Authorization: `Bearer ${accessToken}` },
            //   });
            //   const primaryEmail = emailsResponse.data.find((e: any) => e.primary && e.verified);
            //   if (primaryEmail) {
            //     email = primaryEmail.email;
            //   }
            // }

            if (!username) {
              throw new Error('Could not retrieve username from GitHub.');
            }

            let user = await prisma.user.findFirst({
              where: {
                gitAccounts: { some: { provider: 'github', providerUserId } },
              },
            });

            if (!user) {
              // Create a new user
              user = await prisma.user.create({
                data: {
                  username: username,
                  gitAccounts: {
                    create: {
                      provider: provider ?? 'github',
                      providerUserId: providerUserId,
                      accessToken: accessToken,
                    },
                  },
                },
              });
            } else {
              // Update the access token
              await prisma.gitAccount.updateMany({
                where: { provider: provider ?? 'github', providerUserId },
                data: { accessToken },
              });
            }

            const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
              expiresIn: '12h',
            });
            return { token };
          } else {
            throw new Error('Failed to retrieve access token from GitHub.');
          }
        } catch (error: any) {
          console.error('GitHub Login Error:', error);
          throw new Error('GitHub login failed.');
        }
      } else {
        throw new Error(`Provider "${provider}" not supported.`);
      }
    },

    createProject: async (
      _: any,
      { name, gitRepoUrl }: { name: string; gitRepoUrl: string },
      { prisma, userId }: any
    ) => {
      if (!userId) {
        throw new Error('Authentication required to create a project.');
      }
      console.log(
        `Attempting to create project "${name}" from ${gitRepoUrl} for user ${userId}`
      );

      // validate git url
      try {
        new URL(gitRepoUrl);
        // Add more specific checks here if needed (e.g., ends with .git, is from supported provider)
        if (!gitRepoUrl.endsWith('.git')) {
          console.warn(`Git URL does not end with .git: ${gitRepoUrl}`);
          // Optionally throw an error or add a warning
        }
      } catch (e) {
        console.error(`Invalid gitRepoUrl format: ${gitRepoUrl}`, e);
        throw new Error(`Invalid Git repository URL format.`);
      }

      const project = await prisma.project.create({
        data: {
          name,
          gitRepoUrl,
          userId: userId,
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (!user.username) {
        throw new Error('Username not available');
      }

      // NOTE: cloning will happen during deploying//
      // const destinationPath = path.join(
      //   __dirname,
      //   'repositories',
      //   `${user.username}/${project.name
      //     .split(' ')
      //     .join('_')}-${project.id.toString()}`
      // );

      // try {
      //   await cloneRepository(gitRepoUrl, destinationPath);
      // } catch (error) {
      //   await prisma.project.delete({ where: { id: project.id } });
      //   throw new Error('Failed to clone repository');
      // }
      return project;
    },

    deployProject: async (
      _: any,
      { projectId }: { projectId: number },
      { prisma, userId }: any
    ) => {
      if (!userId) {
        throw new Error('Not authenticated.');
      }
      console.log(
        `Attempting deployment for project ${projectId} by user ${userId}`
      );

      // 1. Fetch project details and verify ownership
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: userId },
      });
      if (!project) {
        throw new Error('Project not found or access denied.');
      }

      // 2. Create Deployment Record (pending status)
      const deployment = await prisma.deployment.create({
        data: {
          projectId: projectId,
          status: 'pending', 
          version: 'TBD', 
          deploymentUrl: '', 
          // buildOutputPath and internalPort will be added/updated later
        },
      });
      const deploymentId = deployment.id;
      console.log(
        `Created deployment record ${deploymentId} for project ${projectId}`
      );

      // 3. Define unique working paths for this deployment
      // buildOutputPath will still be on the mounted drive for accessibility by Nginx/other services
      // The repository clone path will now be in WSL2 home directory
      const baseDeploymentDir = path.join(__dirname, 'deployments'); // Base path for build outputs on mounted drive
      const deploymentWorkingDir = path.join(
        baseDeploymentDir,
        deploymentId.toString()
      ); // Specific dir for build output
      const buildOutputPath = path.join(deploymentWorkingDir, 'build-output'); // Path to store build artifacts

      // Define the base directory for the temporary repository clone within WSL2 home 
      // workaround to pass git permissions issue in WSL2, could use baseDeploymentDir in linux
      const wsl2CloneBaseDir = path.join(
        os.homedir(),
        `.code-catalyst-clones`,
        `deployment-${deploymentId}-repo`
      );
      let clonedRepoPath = ''; // Variable to hold the actual path after cloning

      try {
        // We only need the buildOutputPath parent directory here.
        // buildOutputPath itself is created by extractBuildArtifacts.
        await fs.mkdir(deploymentWorkingDir, { recursive: true });
      } catch (dirError: any) {
        console.error(
          `Failed to create deployment working directory on mounted drive: ${dirError.message}`
        );
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'failed' },
        });
        throw new Error(
          `Failed to prepare deployment workspace on mounted drive: ${dirError.message}`
        );
      }

      // 4. Update status to deploying (early in the process)
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'deploying' },
      });
      console.log(`Deployment ${deploymentId} status updated to 'deploying'.`);

      const imageName = `project-${projectId}-${deploymentId}`; // Unique image tag per deployment for docker

      try {
        // This now clones into the WSL2 home directory and returns the path, could be cloned to same repositories folder
        console.log(
          `Cloning ${project.gitRepoUrl} for deployment ${deploymentId} into WSL2 home.`
        );
        clonedRepoPath = await cloneRepository(
          project.gitRepoUrl,
          deploymentId
        ); 
        console.log(
          `Repository cloned successfully to ${clonedRepoPath} for deployment ${deploymentId}.`
        );

        try {
          const clonedRepoContents = await fs.readdir(clonedRepoPath);
          console.log(
            `Repository contents after cloning (WSL2): ${clonedRepoContents.join(
              ', '
            )}`
          ); 
        } catch (readDirError) {
          console.warn(
            `Failed to read cloned repository directory contents (WSL2): ${readDirError}`
          );
        }

        // 6. Build Docker Image
        console.log(`Building image: ${imageName} from ${clonedRepoPath}`);
        // Pass the clonedRepoPath (in WSL2 filesystem) as the build context
        await buildProjectImage(clonedRepoPath, imageName); 
        console.log(`Image ${imageName} built successfully.`);

        // 7. Artifact Extraction
        console.log(
          `Starting artifact extraction for deployment ${deploymentId} from image ${imageName} to ${buildOutputPath} (on mounted drive).`
        );
        // buildOutputPath is still on the mounted drive where Nginx/serving layer can access it
        await extractBuildArtifacts(imageName, buildOutputPath); // extractBuildArtifacts saves to buildOutputPath
        console.log(
          `Artifacts extracted successfully for deployment ${deploymentId} to ${buildOutputPath}.`
        );

        // --- Cleanup temporary clone directory in WSL2 home ---
        console.log(
          `Cleaning up temporary clone directory in WSL2 home: ${wsl2CloneBaseDir}`
        );
        await cleanUpCloneDirectory(wsl2CloneBaseDir);
        console.log(`Temporary clone directory cleaned up.`);
        // --- End Cleanup ---

        // 8. Running the Application (Serving Layer) 
        console.log(
          `Starting application for deployment ${deploymentId} from ${buildOutputPath}`
        );
        const { internalPort } = await startApplication(
          buildOutputPath,
          deploymentId
        ); // startApplication uses buildOutputPath
        console.log(
          `Application for deployment ${deploymentId} started on internal port ${internalPort}.`
        );

        // 9. Configure Reverse Proxy
        // Generate the public deployment URL
        const deploymentUrl = `http://deploy-${deploymentId}.${project.userId}.nextlive.com`; // Placeholder generation for public URL modify this as needed
        console.log(
          `Configuring Nginx for deployment ${deploymentId}. Public URL: ${deploymentUrl}, Internal Port: ${internalPort}`
        );
        // configureNginxForDeployment uses deploymentUrl, internalPort, deploymentId, and buildOutputPath
        await configureNginxForDeployment(
          deploymentUrl,
          internalPort,
          deploymentId,
          buildOutputPath
        );
        console.log(
          `Nginx configured successfully for deployment ${deploymentId}.`
        );

        // 10. Update Deployment Record on Success
        // Update status, store the extracted path and the generated URL/port
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: 'success',
            buildOutputPath: buildOutputPath, // Store the path to the extracted artifacts
            deploymentUrl: deploymentUrl, // Store the generated public URL
            internalPort: internalPort, // Store the assigned internal port
            // version: commitHash, // Get commit hash from git repo after cloning if needed
          },
        });

        console.log(
          `Deployment ${deploymentId} successful! Artifacts at ${buildOutputPath}, Live URL: ${deploymentUrl}, Internal Port: ${internalPort}`
        );

        // Return the updated successful deployment record
        const finalDeployment = await prisma.deployment.findUnique({
          where: { id: deploymentId },
        });
        return finalDeployment;
      } catch (error: any) {
        console.error(`Deployment ${deploymentId} failed:`, error.message);
        // 11. Update Deployment Record on Failure
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'failed' },
        });

        // --- Cleanup on Failure ---
        console.log(
          `Cleaning up deployment ${deploymentId} working directory ${deploymentWorkingDir} (on mounted drive).`
        );
        // Clean up build output directory on failure
        fs.rm(deploymentWorkingDir, { recursive: true, force: true }).catch(
          (cleanErr) =>
            console.error('Cleanup of build output directory failed:', cleanErr)
        );

        // Clean up temporary clone directory in WSL2 home on failure
        if (wsl2CloneBaseDir) {
          // Only attempt if the base dir was defined
          console.log(
            `Cleaning up temporary clone directory in WSL2 home on failure: ${wsl2CloneBaseDir}`
          );
          cleanUpCloneDirectory(wsl2CloneBaseDir).catch((cleanErr) =>
            console.error(
              'Cleanup of WSL2 clone directory failed on error:',
              cleanErr
            )
          );
        }
        // Also clean up the built Docker image on failure? docker rmi imageName -f

        // TODO: If proxy config was partially applied, attempt to roll it back on failure
        // This adds significant complexity.

        // Re-throw error for GraphQL client
        throw new Error(`Deployment failed: ${error.message}`);
      }
    },
  },
};

export default resolvers;
