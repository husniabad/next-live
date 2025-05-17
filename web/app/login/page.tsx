
'use client'; 

import { Button } from '@/components/ui/button'; 
import { useRouter } from 'next/navigation'; 
import { gql, useMutation } from '@apollo/client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';


const LOGIN_GIT = gql`
  mutation LoginGit($provider: String!, $code: String!) {
    loginGit(provider: $provider, code: $code) {
      token # We expect a JWT token back from the API
    }
  }
`;

const HomePage = () => {
  const { isAuthenticated } = useAuth(); 
   const router = useRouter(); // Hook to access Next.js router for navigation
    const [loginGitMutation, ] = useMutation(LOGIN_GIT); // Apollo mutation hook
    const [error, setError] = useState<string | null>(null); // State to store login errors
    const [isLoggingIn, setIsLoggingIn] = useState(false);


    // check if the user is already authenticated
    useEffect(() => {
      if (isAuthenticated) {
        console.log("User is already authenticated, redirecting to dashboard.");
        window.location.href = '/';
      }
    }, [isAuthenticated, router]); // Added router to dependencies

      const handleGitHubLogin = () => {
        // Get environment variables for GitHub OAuth from the client-side
        const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
        const redirectUri = process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI; // This should be the URL of your callback page/route
    
        if (!clientId || !redirectUri) {
          setError('GitHub client ID or redirect URI not configured in environment variables.');
          console.error('Missing NEXT_PUBLIC_GITHUB_CLIENT_ID or NEXT_PUBLIC_GITHUB_REDIRECT_URI');
          return;
        }

        const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo`;
    
        window.location.href = authUrl;
      };
    
      const handleCallback = async (code: string) => {
        setIsLoggingIn(true);
    
        try {
          const { data } = await loginGitMutation({
            variables: { provider: 'github', code }, // Pass provider and the received code
          });
    
          // Check if a token was received
          if (data?.loginGit?.token) {
            // Store the received JWT token in local storage
            localStorage.setItem('token', data.loginGit.token);
            console.log("Login successful, token stored.", data.loginGit.token);
            router.replace(window.location.pathname, undefined);
            window.location.href = '/';
            return
          } else {
             setError('Login failed: No token received.');
             console.error('Login mutation did not return a token.');
          }
          //@ts-ignore
        } catch (err: any) {
          // Handle errors during the mutation or token storage
          setError(`Login failed: ${err.message || 'An unknown error occurred.'}`);
          console.error('Error during login mutation callback:', err);
        } finally {
          setIsLoggingIn(false); // for both success and failure
        }
        
      };
    
      useEffect(() => {
        
        const urlParams = new URLSearchParams(window?.location.search);
        const code = urlParams.get('code');

        if (typeof window !== 'undefined' && window.location.search.includes('code=') && !isLoggingIn) {
           console.log("OAuth code detected in URL, attempting to handle callback.");
           handleCallback(code as string); // Call the callback handler
        }
      }, [isLoggingIn, router]); // Added dependencies to useEffect

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
         <div className='flex flex-col gap-4 items-center'> {/* Centered items */}
      {/* Button that triggers the GitHub OAuth redirect */}
      <Button type='button' onClick={handleGitHubLogin}>Login with GitHub</Button>
      {/* Display error message if any */}
      {error && <p className="text-red-500 text-sm">{error}</p>} {/* Styled error message */}
    </div>
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
