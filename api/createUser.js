const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createUser(username, password) {
  const hashedPassword = await bcrypt.hash(password, 10); // Hash the password
  const user = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
    },
  });
  console.log('User created:', user);
}

async function main() {
  try {
    await createUser('testuser', 'testpassword');
  } catch (error) {
    console.error('Error creating user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();