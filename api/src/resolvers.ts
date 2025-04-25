// src/resolvers.ts

import { PrismaClient } from '@prisma/client';
import path from 'path';
import { cloneRepository } from './gitService';
import { buildProjectImage, extractBuildArtifacts } from './buildService';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from "fs"
import { startApplication } from './servingService';

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
        console.log("repos:",response)
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
      console.log("provider",provider,"\ncode", code)

      let accessToken: string | null = null;
      let providerUserId: string | null = null;
      let username: string | null = null;
      let email: string | null = null; // GitHub also provides email

      if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        throw new Error('GitHub Client ID or Secret not configured on the server.');
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
            const userInfoResponse = await axios.get('https://api.github.com/user', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
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
              where: { gitAccounts: { some: { provider: 'github', providerUserId } } },
            });

            if (!user) {
              // Create a new user
              user = await prisma.user.create({
                data: {
                  username: username,
                  gitAccounts: {
                    create: {
                      provider: 'github',
                      providerUserId: providerUserId,
                      accessToken: accessToken,
                    },
                  },
                },
              });
            } else {
              // Update the access token
              await prisma.gitAccount.updateMany({
                where: { provider: 'github', providerUserId },
                data: { accessToken },
              });
            }

            const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
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

    createProject: async (_: any, { name, gitRepoUrl }: {name:string, gitRepoUrl:string}, {prisma, userId}:any) => {

      if (!userId) {
        throw new Error('Authentication required to create a project.');
        }
      console.log(`Attempting to create project "${name}" from ${gitRepoUrl} for user ${userId}`);
      
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
          userId:userId,
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        throw new Error('User not found');
      }
      
      if (!user.username) {
        throw new Error('Username not available');
      }
    

      const destinationPath = path.join(__dirname, 'repositories', `${user.username}/${project.name.split(" ").join("_")}-${project.id.toString()}`);

      // try {
      //   await cloneRepository(gitRepoUrl, destinationPath);
      // } catch (error) {
      //   await prisma.project.delete({ where: { id: project.id } });
      //   throw new Error('Failed to clone repository');
      // }
      return project;
    },
    

    deployProject: async (_: any, { projectId }: { projectId: number }, { prisma, userId }: any) => {
      if (!userId) {
        throw new Error('Not authenticated.');
      }

      // 1. Fetch project details (including gitRepoUrl) and verify ownership
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: userId },
      });
      if (!project) {
        throw new Error('Project not found or access denied.');
      }

      // 2. Create Deployment Record
      const deployment = await prisma.deployment.create({
        data: {
          projectId: projectId,
          status: 'pending', // Start as pending
          version: 'TBD', // Placeholder
          deploymentUrl: '', // Placeholder
        },
      });
      const deploymentId = deployment.id;
      console.log(`Created deployment record ${deploymentId} for project ${projectId}`);

      // 3. Define unique paths for this deployment
      const baseWorkingDir = path.join(__dirname, 'deployments'); // Example base path for all deployment files
       const deploymentWorkingDir = path.join(baseWorkingDir, deploymentId.toString());
      const repoPath = path.join(deploymentWorkingDir, 'repository'); // Path to clone repo for THIS deployment
      const buildOutputPath = path.join(deploymentWorkingDir, 'build-output'); // Path to store build artifacts for THIS deployment
      // console.log("baseWorkingDir",baseWorkingDir, "\ndeploymentWorkingDir",deploymentWorkingDir, "\nrepoPath",repoPath, "\nbuildOutputPath",buildOutputPath)


      // Ensure working directories exist
      try {
          await fs.promises.mkdir(repoPath, { recursive: true });
          await fs.promises.mkdir(buildOutputPath, { recursive: true }); // Make sure build output dir exists
      } catch (dirError) {
          console.error(`Failed to create deployment working directories: ${dirError}`);
          await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'failed' } });
          throw new Error(`Failed to prepare deployment workspace.`);
      }

      try {
        // 4. Update status to deploying
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'deploying' },
        });

        // 5. Clone Repository
        console.log(`Cloning ${project.gitRepoUrl} to ${repoPath}`);
        await cloneRepository(project.gitRepoUrl, repoPath);
        console.log(`Repository cloned successfully to ${repoPath}. Listing contents:`);
        const clonedRepoContents = await fs.promises.readdir(repoPath);
        console.log(clonedRepoContents);
        console.log(`Checking for package.json: ${clonedRepoContents.includes('package.json') ? 'Found!' : 'Not Found!'}`);
        // 6. Build Docker Image <--- USE THE UPDATED FUNCTION
        const imageName = `project-${projectId}-${deploymentId}`; // Unique image tag per deployment
        console.log(`Building image: ${imageName} from ${repoPath}`);
        await buildProjectImage(repoPath, imageName); // Call the build function
        console.log(`Image ${imageName} built successfully.`);

        // 7. Run the container (using imageName) - Implement this logic
        console.log(`Starting artifact extraction for deployment ${deploymentId} from image ${imageName} to ${buildOutputPath}`);
        await extractBuildArtifacts(imageName, buildOutputPath); // Call the extraction function
        console.log(`Artifacts extracted successfully for deployment ${deploymentId} to ${buildOutputPath}.`);

        // 8. Configure Reverse Proxy (using hostPort or container networking) - Implement this logic
        console.log(`start application for deployment ${deploymentId} from build output ${buildOutputPath}`);
        const {internalPort} = await startApplication(buildOutputPath, deploymentId); // Start the application and get the internal port
        console.log(`Application for deployment ${deploymentId} started on internal port ${internalPort}.`);

        // --- Step 9 (Configure Proxy) is NEXT ---
        // 9. Configure Reverse Proxy
        // Generate the public deployment URL and configure your proxy
        const deploymentUrl = `http://deploy-${deploymentId}.${project.userId}.yourplatform.com`; // Placeholder generation for public URL
        // TODO: Call a function here to configure your reverse proxy (Nginx, Caddy, etc.)
        // await configureReverseProxy(deploymentUrl, internalPort); // Your function to update proxy config
        console.log(`Conceptual: Proxy configured for ${deploymentUrl} forwarding to ${internalPort}.`);

        // 10. Update Deployment Record on Success
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: 'success',
            // deploymentUrl: deploymentUrl,
            // version: commitHash, // Get commit hash from git repo?
          },
        });

        console.log(`Deployment ${deploymentId} successful! Artifacts at ${buildOutputPath}, Live URL: ${deploymentUrl}, Internal Port: ${internalPort}`);

        // TODO: Implement cleanup of repoPath directory after build/extraction is complete
        // fs.rm(repoPath, { recursive: true, force: true }).catch(cleanErr => console.error("Cleanup of repoPath failed:", cleanErr))

       const finalDeployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
      return finalDeployment;

      } catch (error: any) {
        console.error(`Deployment ${deploymentId} failed: ${error.message}`);
        // 10. Update Deployment Record on Failure
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'failed' },
        });
        // Perform cleanup (delete cloned repo, potentially stopped container/image)
        // ... cleanup logic ...
        throw new Error(`Deployment failed: ${error.message}`); // Re-throw error for GraphQL
      }
    },
  },
};

export default resolvers;