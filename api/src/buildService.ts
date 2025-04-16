// src/buildService.ts

import { exec } from 'child_process';
import path from 'path';

async function buildProject(repoPath: string, buildOutputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(
      `docker build -t project-build ${repoPath} && docker run --rm -v ${buildOutputPath}:/app/out project-build`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          reject(error);
          return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
        resolve();
      }
    );
  });
}

export { buildProject };