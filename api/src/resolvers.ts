// src/resolvers.ts

import { PrismaClient } from '@prisma/client';
import path from 'path';
import { cloneRepository } from './gitService';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

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
      let accessToken: string;
      let providerUserId: string;
      let username: string;

      // 1. Get Access Token
      if (provider === 'github') {
        const response = await axios.post(
          'https://github.com/login/oauth/access_token',
          {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
          },
          { headers: { Accept: 'application/json' } }
        );
        accessToken = response.data.access_token;
        // 2. Get User Info
        const userInfo = await axios.get('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        providerUserId = userInfo.data.id.toString();
        username = userInfo.data.login;
      } else {
        // Handle other providers (gitlab, etc.)
        throw new Error(`Provider ${provider} not supported yet.`);
      }

      // 3. Create/Update User & GitAccount
      let user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        user = await prisma.user.create({ data: { username } });
      }

      await prisma.gitAccount.upsert({
        where: { provider_providerUserId: { provider, providerUserId } },
        update: { accessToken },
        create: {
          provider,
          providerUserId,
          accessToken,
          userId: user.id,
        },
      });

      // 4. Generate JWT
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
      return { token };
    },
  },
};

export default resolvers;