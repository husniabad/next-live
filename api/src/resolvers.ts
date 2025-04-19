// src/resolvers.ts

import { PrismaClient } from '@prisma/client';
import path from 'path';
import { cloneRepository } from './gitService';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
// const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

interface CreateProjectArgs {
  name: string;
  gitRepoUrl: string;
  userId: number;
}

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
    createProject: async (_: any, { name, gitRepoUrl, userId }: CreateProjectArgs) => {
      const project = await prisma.project.create({
        data: {
          name,
          gitRepoUrl,
          userId,
        },
      });

      const destinationPath = path.join(__dirname, 'repositories', project.id.toString());

      try {
        await cloneRepository(gitRepoUrl, destinationPath);
      } catch (error) {
        await prisma.project.delete({ where: { id: project.id } });
        throw new Error('Failed to clone repository');
      }
      return project;
    },
    
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
  },
};

export default resolvers;