'use client';

import { ApolloProvider } from '@apollo/client';
import client from '@/lib/apolloClient'; // Assuming the path to your Apollo Client instance

export default function ApolloWrapper({ children }: { children: React.ReactNode }) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}