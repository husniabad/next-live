// web/lib/apolloClient.ts

'use client'; // This file uses client-side features like localStorage

import { ApolloClient, InMemoryCache, createHttpLink, ApolloLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

// Get the GraphQL API URL from environment variables
// Ensure NEXT_PUBLIC_GRAPHQL_ENDPOINT is set in your .env.local file
const graphqlApiUrl = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT;

// --- Add a check for the environment variable ---
if (typeof graphqlApiUrl !== 'string' || !graphqlApiUrl) {
  console.error('FATAL ERROR: NEXT_PUBLIC_GRAPHQL_ENDPOINT environment variable is not set or is not a string.');
  console.error('Please ensure you have a .env.local file in your web directory with NEXT_PUBLIC_GRAPHQL_ENDPOINT set to your backend GraphQL URL (e.g., http://localhost:4000/graphql).');
  // Throw an error to halt the application startup if the URL is missing
  throw new Error('GraphQL API endpoint is not configured.');
}
// --- End check ---

console.log(`Apollo Client connecting to GraphQL API at: ${graphqlApiUrl}`);


// Create an HttpLink pointing to your GraphQL API endpoint
const httpLink = createHttpLink({
  uri: graphqlApiUrl, // Use the validated URL
});

// Create an authLink to add the JWT token to the headers
const authLink = setContext((_, { headers }) => {
  // Get the authentication token from local storage if it exists
  // This runs for every request, ensuring the latest token is used
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null; // Check if window is defined

  // Return the headers to the context so httpLink can read them
  return {
    headers: {
      ...headers,
      // Add the Authorization header if a token is present
      authorization: token ? `Bearer ${token}` : "",
    }
  };
});

// Create the Apollo Client instance
const client = new ApolloClient({
  // Chain the authLink and httpLink
  link: ApolloLink.from([authLink, httpLink]),
  // Use an in-memory cache
  cache: new InMemoryCache(),
  // Optional: Add other configurations like error handling, type policies, etc.
});

// Export the Apollo Client instance as the default export
export default client;
