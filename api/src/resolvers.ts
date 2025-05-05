// src/resolvers.ts

import { PrismaClient } from '@prisma/client';
// Import only necessary services used by resolvers (like Prisma, axios, jwt, URL)
// The background processing services (gitService, buildService, etc.) are imported by processDeployment.ts
import { enqueueDeployment } from './deploymentQueue'; // Import the enqueue function
import { processDeployment } from './processDeployment'; // Import the background processing function (needed for type hinting and potentially direct call if queue fails)
import jwt from 'jsonwebtoken';
import { URL } from 'url';
import axios from 'axios';
// Removed p-limit import
// fs and os are not directly needed in resolvers.ts anymore unless used by other resolvers
// path is used by createProject, so keep it
import path from 'path';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// MAX_CONCURRENT_DEPLOYMENTS and queue setup are now in deploymentQueue.ts

const resolvers = {
  Query: {
    projects: async (_: any, __: any, { userId }: { userId: number }) => {
      if (!userId) {
        throw new Error('Not authenticated.');
      }
      const projects = await prisma.project.findMany({
        where: { userId: userId },
        include: {
          deployments:true
        },
      });

      if (!projects) {
        throw new Error('No projects found for this user.');
      }
      return projects;
    },
    project: async (_: any, { id }: { id: number }, {userId}:{userId:number}) => {
        if(!userId) {
            throw new Error('Not authenticated.');
        }

      const project = await prisma.project.findUnique({
         where: { id: id },
            include: {
            deployments: true, 
            },
        
        });

        if (!project) {
            throw new Error('Project not found.');
            }


            return project;

    },
    me: async (_: any, __: any, { userId }: { userId: number }) => {
      if (!userId) {
        throw new Error('Not authenticated.');
      }

      // Correctly fetch the User based on the userId and include their gitAccounts
      const userWithGitAccounts = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        include: {
          gitAccounts: true, 
        },
      });

      if (!userWithGitAccounts) {

        throw new Error('User not found.');
      }

      console.log('me:', userWithGitAccounts);
      return userWithGitAccounts;
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
          full_name: repo.full_name,
          html_url: repo.html_url,
          clone_url: repo.clone_url,
          size : repo.size,
          description : repo.description
        }));
      } catch (error: any) {
        console.error('Error fetching GitHub repos:', error.message);
        throw new Error('Failed to fetch GitHub repositories.');
      }
    },
    deploymentStatus: async (
      _: any,
      { id }: { id: number },
      { prisma, userId }: any
    ) => {
      if (!userId) {
        throw new Error('Not authenticated.');
      }
      console.log(`Fetching status for deployment ${id} by user ${userId}`);
      const deployment = await prisma.deployment.findFirst({
        where: { id: id, project: { userId: userId } },
        select: {
          id: true,
          projectId:true,
          status: true,
          version: true,
          deploymentUrl: true,
          buildOutputPath: true,
          internalPort: true,
          dockerfileUsed: true,
          errorMessage: true,
          createdAt: true,
        },
      });

      if (!deployment) {
        throw new Error('Deployment not found.');
      }

      return deployment;
    },
  },
  Mutation: {
    loginGit: async (_: any, { provider, code }: any) => {
      console.log('provider', provider, '\ncode', code);

      let accessToken: string | null = null;
      let providerUserId: string | null = null;
      let username: string | null = null;
      let avatarUrl: string | null = null; 
      let name : string | null = null; 
      let profileUrl: string | null = null; 
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
            avatarUrl = userInfoResponse.data.avatar_url; 
            profileUrl = userInfoResponse.data.html_url; 
            name = userInfoResponse.data.name; 
            console.log('git user', userInfoResponse.data);

            // Optionally fetch emails if the primary email is private
            // if (!email) {
            //  const emailsResponse = await axios.get('https://api.github.com/user/emails', {
            //      headers: { Authorization: `Bearer ${accessToken}` },
            //     });
            //  const primaryEmail = emailsResponse.data.find((e: any) => e.primary && e.verified);
            //  if (primaryEmail) {
            //    email = primaryEmail.email;
            //  }
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
                      avatarUrl: avatarUrl,
                      profileUrl: profileUrl,
                      name: name,
                    },
                  },
                },
              });
            } else {
              // Update the access token
              await prisma.gitAccount.updateMany({
                where: { provider: provider ?? 'github', providerUserId },
                data: { accessToken, avatarUrl, profileUrl, name },
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

      let deployment: any; // Declare deployment variable outside try block

      try {
        // 1. Fetch project details and verify ownership
        const project = await prisma.project.findFirst({
          where: { id: projectId, userId: userId },
        });
        if (!project) {
          throw new Error('Project not found or access denied.');
        }

        // 2. Create Deployment Record (pending status)
        deployment = await prisma.deployment.create({
          // Assign to declared variable
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
        console.log(
          `Triggering asynchronous deployment process for deployment ${deploymentId}.`
        );

        // Enqueue the deployment task using the enqueueDeployment function
        // We wrap the call to processDeployment in an anonymous async function
        // so it's executed by the worker when concurrency allows.
        enqueueDeployment(async () => {
          try {
            // Call the processDeployment function with necessary parameters
            await processDeployment({
              deploymentId: deployment.id,
              projectId: project.id,
              userId: userId, // Pass userId for URL generation in async process
              gitRepoUrl: project.gitRepoUrl,
              // Pass any other necessary data here
            });
          } catch (error) {
            // This catch block is a fallback in case processDeployment
            // throws an unhandled error after its own internal catch.
            // processDeployment should ideally handle all its errors and update DB status.
            console.error(
              `[Deployment ${deploymentId}] Unhandled error from processDeployment:`,
              error
            );
            // Optionally update status to failed here if not already done by processDeployment
            await prisma.deployment
              .update({
                where: { id: deploymentId },
                data: {
                  status: 'failed',
                  errorMessage: `Unhandled processing error: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              })
              .catch((dbError: any) =>
                console.error(
                  `[Deployment ${deploymentId}] Failed to update status to failed after unhandled error:`,
                  dbError
                )
              );
          }
        });

        console.log(
          `Asynchronous deployment process triggered for deployment ${deploymentId}.`
        );

        // 3. Immediately return the pending deployment record
        console.log(
          `Returning pending deployment record ${deploymentId} to client.`
        );
        return deployment;
      } catch (error: any) {
        console.error(
          `Error during initial deployment request for project ${projectId}:`,
          error.message
        );

        // If an error occurred *after* creating the deployment record but before
        // successfully enqueuing (e.g., enqueueDeployment threw an error),
        // update the deployment record status to 'failed'.
        // Check if the `deployment` variable was successfully assigned (meaning the record was created).
        if (typeof deployment !== 'undefined' && deployment !== null) {
          console.log(
            `Updating deployment ${deployment.id} status to 'failed' due to initiation error.`
          );
          await prisma.deployment
            .update({
              where: { id: deployment.id },
              data: { status: 'failed', errorMessage: error.message },
            })
            .catch((dbError: any) =>
              console.error(
                `Failed to update deployment ${deployment.id} to failed status:`,
                dbError
              )
            );
        }

        // Re-throw the error so the GraphQL client receives it
        throw new Error(`Deployment initiation failed: ${error.message}`);
      }
    },
  },
};

export default resolvers;
