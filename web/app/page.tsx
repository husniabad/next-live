// web/app/page.tsx

'use client'; // This component uses client-side features like hooks if auth check is added

import Link from 'next/link';
import { Button } from '@/components/ui/button'; // Assuming shadcn button import path
import Login from '@/components/Login'; // Assuming Login component path (or LoginButton)
// Remove the import of ApolloProvider and the client instance here
// import { ApolloProvider } from '@apollo/client';
// import client from '@/lib/apolloClient';


// This is the main landing page component.
// It will be the entry point for unauthenticated users.
// Authentication check and redirection logic will be added here later.

const HomePage = () => {
  // TODO: Implement authentication check here.
  // If authenticated, redirect to /dashboard.
  // Example (requires useRouter from 'next/navigation' and useAuth hook from lib/auth.ts):
  /*
  const { isAuthenticated, isLoading } = useAuth(); // Assuming useAuth hook from lib/auth.ts
  const router = useRouter();

  // Redirect authenticated users to the dashboard
  if (isAuthenticated && !isLoading) {
    router.push('/dashboard');
    return null; // Or a loading spinner
  }

  // Show loading state while checking auth
  if (isLoading) {
      return <div>Loading...</div>; // Or a loading spinner component
  }
  */

  // If not authenticated (or while auth is being checked initially), display the landing page content
  return (
    // Remove the incorrect ApolloProvider wrapping here
    // <ApolloProvider client={client}>
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-gray-100 p-4">
       <h1 className="text-5xl font-bold mb-6 text-center text-white">Welcome to Next Live</h1> {/* Ensured title is white */}
       <p className="text-xl mb-8 text-center max-w-2xl text-gray-300"> {/* Slightly lighter text for paragraph */}
         Build, deploy, and host your web applications with ease. Get your code from repository to live URL in minutes. **Specializing in Next.js projects.**
       </p>

       <div className="mb-8 text-center">
         <h2 className="text-2xl font-semibold mb-4 text-white">Our Services:</h2> {/* Ensured heading is white */}
         <ul className="list-disc list-inside text-lg text-left inline-block text-gray-300"> {/* Slightly lighter text for list */}
           <li>Connect with Git providers (GitHub)</li>
           <li>Automatic Docker-based builds</li>
           <li>Support for custom Dockerfiles</li>
           <li>Asynchronous deployments with concurrency limits</li>
           <li>Dynamic Nginx proxying</li>
           <li>Real-time deployment status tracking</li>
           {/* Added explicit mention of Next.js */}
           <li>Optimized builds for Next.js applications (including standalone output)</li>
         </ul>
       </div>
       {/* Placeholder for the Login Button */}
       {/* This button will initiate the GitHub OAuth flow */}
       <div className="mt-8">
         {/* Use the Login component (or LoginButton if renamed) */}
         <Login/>
       </div>

       {/* Optional: Add links to documentation, features, etc. */}
       {/*
       <div className="mt-8 text-center">
           <Link href="/features" legacyBehavior>
               <a className="text-blue-400 hover:underline mx-2">Learn More</a>
           </Link>
           <Link href="/docs" legacyBehavior>
                <a className="text-blue-400 hover:underline mx-2">Documentation</a>
           </Link>
       </div>
       */}
     </div>
     // Remove the closing tag for the incorrect ApolloProvider
     // </ApolloProvider>
  );
};

export default HomePage;
