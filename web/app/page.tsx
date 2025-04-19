'use client';

import Login from '@/components/Login';
import { ApolloProvider } from '@apollo/client';
import client from '@/lib/apolloClient';

export default function Home() {
  return (
    <ApolloProvider client={client}>
      <main className="flex min-h-screen flex-col items-center justify-between p-24">
        <Login/>
      </main>
    </ApolloProvider>
  );
}