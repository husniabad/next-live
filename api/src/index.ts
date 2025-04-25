// src/index.ts

import { ApolloServer } from 'apollo-server';
import fs from 'fs';
import path from 'path';
import resolvers from './resolvers'; // Corrected import path
import express, { Request, Response } from 'express';
import { buildProjectImage } from './buildService'; // Corrected import path

// import { startStandaloneServer } from '@apollo/server/standalone';
// import { typeDefs } from '../schema.graphql';
// import typedDef
import { PrismaClient } from '@prisma/client';
import { makeExecutableSchema } from '@graphql-tools/schema';
// import { authDirectiveTransformer } from './authDirective'; // Import the directive transformer
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
 const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

 // Create an executable schema with the directive transformer
 const typeDefs = fs.readFileSync(
   path.join(__dirname, '../schema.graphql'),
   'utf8'
 );
 let schema = makeExecutableSchema({ typeDefs, resolvers });
//  schema = authDirectiveTransformer(schema);

const app = express();
app.use(express.json());


const server = new ApolloServer({
  schema,
  context: async ({ req }) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let userId: number | null = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
        userId = decoded.userId;
      } catch (error) {
        console.warn('Invalid or expired token');
      }
    }
    return { prisma, userId }; // Make userId available in the context
  },
});

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`);
  app.listen(3001, () => {
    console.log('Webhook ready at port 3001');
  });
});

app.post('/webhook', async (req: Request, res: Response) => {
  const payload = req.body;
  const projectId = 1; // Get from payload.
  const repoPath = path.join(__dirname, 'repositories', projectId.toString());
  const buildOutputPath = path.join(__dirname, 'builds', projectId.toString());
  try {
    await buildProjectImage(repoPath, buildOutputPath);
    console.log('Project build success');
    res.sendStatus(200);
  } catch (e) {
    console.log('Project build failed');
    res.sendStatus(500);
  }
});

app.get('/test', (req: Request, res: Response) => {
  res.send('API is working');
});