
import { ApolloServer } from 'apollo-server';
import fs from 'fs';
import path from 'path';
import resolvers from './resolvers';
import express, { Request, Response } from 'express';
import { buildProjectImage } from './buildService'; 
import { PrismaClient } from '@prisma/client';
import { makeExecutableSchema } from '@graphql-tools/schema';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
 const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

 // Create an executable schema with the directive transformer
 const typeDefs = fs.readFileSync(
  path.join(__dirname, '../schema.graphql'),
  'utf8'
 );
 let schema = makeExecutableSchema({ typeDefs, resolvers });

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

const port = parseInt(process.env.PORT || '4000', 10);
console.log(`Attempting to start server on port: ${port}`);



server.listen({ port }).then(({ url }) => {
  console.log(`Server ready at ${url}`);
  // The webhook is currently listening on a separate hardcoded port (3001).
  // If deploying to a single container, you'll need to integrate this webhook
  // into the main Express app listening on the PORT environment variable.
  app.listen(3001, () => {
    console.log('Webhook ready at port 3001');
  });
});

app.post('/webhook', async (req: Request, res: Response) => {
  const payload = req.body;
  const projectId = 1; 
  const repoPath = path.join(__dirname, 'repositories', projectId.toString());
  const buildOutputPath = path.join(__dirname, 'builds', projectId.toString());
  try {

    await buildProjectImage(repoPath, buildOutputPath, 'logFilePath'); 
    console.log('Project build success');
    res.sendStatus(200);
  } catch (e) {
    console.log('Project build failed');
    res.sendStatus(500);
  }
});

app.get('/test', (_: Request, res: Response) => {
  res.send('API is working');
});
