// app/layout.tsx

import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from '@/lib/auth'; // Import the AuthProvider
// Import the new ApolloWrapper Client Component
import ApolloWrapper from '@/components/ApolloWrapper';


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Next Live",
  description: "Deploy your Next.js applications easily",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Wrap with ApolloWrapper (Client Component) */}
        <ApolloWrapper>
           {/* Wrap with AuthProvider (also a Client Component) */}
           {/* AuthProvider needs to be inside ApolloWrapper if any auth logic uses Apollo Client */}
           {/* Otherwise, they can be siblings within ApolloWrapper */}
           {/* Placing AuthProvider inside ApolloWrapper is generally safer */}
           <AuthProvider>
             <div className="flex flex-col min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-gray-100">
               {children}
             </div>
           </AuthProvider>
        </ApolloWrapper>
      </body>
    </html>
  );
}