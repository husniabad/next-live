// web/components/LoginButton.tsx
'use client'; // This component uses client-side hooks like useEffect and useRouter

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; // Correct import for App Router
import { useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
// axios is not strictly needed here if Apollo handles the mutation, but keep if used elsewhere
// import axios from 'axios';
import { Button } from './ui/button'; // Assuming shadcn button import path

// GraphQL Mutation definition for logging in with Git provider code
const LOGIN_GIT = gql`
  mutation LoginGit($provider: String!, $code: String!) {
    loginGit(provider: $provider, code: $code) {
      token # We expect a JWT token back from the API
    }
  }
`;

// This component handles the GitHub login button and the OAuth callback
const LoginButton = () => { // Renamed component from Login to LoginButton
  const router = useRouter(); // Hook to access Next.js router for navigation
  const [loginGitMutation, { loading: mutationLoading }] = useMutation(LOGIN_GIT); // Apollo mutation hook
  const [error, setError] = useState<string | null>(null); // State to store login errors
  const [isLoggingIn, setIsLoggingIn] = useState(false); // State to indicate if currently processing login callback

  // Function to initiate the GitHub OAuth redirect
  const handleGitHubLogin = () => {
    // Get environment variables for GitHub OAuth from the client-side
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI; // This should be the URL of your callback page/route

    if (!clientId || !redirectUri) {
      setError('GitHub client ID or redirect URI not configured in environment variables.');
      console.error('Missing NEXT_PUBLIC_GITHUB_CLIENT_ID or NEXT_PUBLIC_GITHUB_REDIRECT_URI');
      return;
    }

    // Construct the GitHub OAuth authorization URL
    // The 'scope=repo' requests access to user's repositories
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo`;

    // Redirect the user's browser to the GitHub authorization URL
    // window.location.href is the standard way to perform an external redirect
    window.location.href = authUrl;
  };

  // Function to handle the callback after the GitHub redirect
  const handleCallback = async (code: string) => {
    setIsLoggingIn(true); // Set state to indicate login processing

    try {
      // Execute the GraphQL mutation to exchange the code for a JWT token
      const { data } = await loginGitMutation({
        variables: { provider: 'github', code }, // Pass provider and the received code
      });

      // Check if a token was received
      if (data?.loginGit?.token) {
        // Store the received JWT token in local storage
        localStorage.setItem('token', data.loginGit.token);
        console.log("Login successful, token stored.");

        // Redirect the user to the dashboard page after successful login
        router.push('/'); // Use router.push for internal navigation
      } else {
         setError('Login failed: No token received.');
         console.error('Login mutation did not return a token.');
         setIsLoggingIn(false); // Reset state if login failed
      }

    } catch (err: any) {
      // Handle errors during the mutation or token storage
      setError(`Login failed: ${err.message || 'An unknown error occurred.'}`);
      console.error('Error during login mutation callback:', err);
      setIsLoggingIn(false); // Reset state on error
    }
     // Clean up the code parameter from the URL after processing
     // This prevents issues if the user refreshes the callback page
     router.replace(window.location.pathname, undefined);
  };

  // useEffect hook to check for the OAuth 'code' parameter on page load
  useEffect(() => {
    // This effect runs on the client side after the component mounts.
    // It checks if the current URL is the OAuth redirect URL and contains the 'code'.
    const urlParams = new URLSearchParams(window?.location.search);
    const code = urlParams.get('code');

    // Check if we are on the callback URL and have a code
    // Ensure this check only happens once and not on subsequent renders
    if (typeof window !== 'undefined' && window.location.search.includes('code=') && !isLoggingIn) {
       console.log("OAuth code detected in URL, attempting to handle callback.");
       // Remove the code from the URL immediately to prevent re-processing on refresh
       // router.replace(window.location.pathname, undefined, { shallow: true }); // Moved this to handleCallback
       handleCallback(code as string); // Call the callback handler
    }
    // The dependency array is empty, so this effect runs only once after the initial render.
    // isLoggingIn is included to prevent re-running if handleCallback updates the state.
  }, [isLoggingIn, router]); // Added dependencies to useEffect

  // Render loading state while processing the callback
  if (isLoggingIn || mutationLoading) { // Also show loading state while mutation is in progress
    return <p>Logging in...</p>; // Or a loading spinner component
  }

  // Render the login button if not currently logging in
  return (
    <div className='flex flex-col gap-4 items-center'> {/* Centered items */}
      {/* Button that triggers the GitHub OAuth redirect */}
      <Button onClick={handleGitHubLogin}>Login with GitHub</Button>
      {/* Display error message if any */}
      {error && <p className="text-red-500 text-sm">{error}</p>} {/* Styled error message */}
    </div>
  );
};

export default LoginButton; // Export as LoginButton
