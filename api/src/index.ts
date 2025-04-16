// src/index.ts

import { ApolloServer } from 'apollo-server';
import fs from 'fs';
import path from 'path';
import resolvers from './resolvers'; // Corrected import path
import express, { Request, Response } from 'express';
import { buildProject } from './buildService'; // Corrected import path

const app = express();
app.use(express.json());

const typeDefs = fs.readFileSync(
  path.join(__dirname, '../schema.graphql'),
  'utf8'
);

const server = new ApolloServer({
  typeDefs,
  resolvers,
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
    await buildProject(repoPath, buildOutputPath);
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