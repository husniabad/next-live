// test_fs.js
const path = require('path');
const fs = require('fs');

// IMPORTANT: Adjust this path calculation based on where you save test_fs.js
// and where your dockerfiles directory is relative to it.
// Example: If test_fs.js is in D:\Projects\code-catalyst\ and dockerfiles is in D:\Projects\code-catalyst\dockerfiles\
const testPath = path.join(__dirname, 'dockerfiles', 'Dockerfile.nextjs.default');

// OR, if test_fs.js is anywhere, just use the absolute path you think is correct:
// const testPath = 'D:\\Projects\\code-catalyst\\dockerfiles\\Dockerfile.nextjs.default'; // Use double backslashes or forward slashes in string literal

console.log(`Checking fs.existsSync for path: ${testPath}`);

if (fs.existsSync(testPath)) {
    console.log('File found successfully!');
} else {
    console.error('File NOT found!');
}

console.log(`__dirname in test_fs.js: ${__dirname}`);