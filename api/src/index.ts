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

// --- Use the PORT environment variable provided by the hosting environment ---
// Default to 4000 for local development if PORT is not set.
const port = parseInt(process.env.PORT || '4000', 10);
console.log(`Attempting to start server on port: ${port}`);
// --- End PORT environment variable handling ---


// Start the Apollo server, listening on the determined port
// Note: This setup starts the Apollo server and a separate Express app on different ports.
// In a single container environment like Cloud Run, you typically want one process
// listening on the PORT environment variable. The previous Canvas structure using
// apollo-server-express and http.createServer is more suitable for that.
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
  const projectId = 1; // Get from payload.
  const repoPath = path.join(__dirname, 'repositories', projectId.toString());
  const buildOutputPath = path.join(__dirname, 'builds', projectId.toString());
  try {
    // buildProjectImage might need refinement based on your build service logic
    // and how it handles log file paths.
    await buildProjectImage(repoPath, buildOutputPath, 'logFilePath'); // Assuming logFilePath is the 3rd argument
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
