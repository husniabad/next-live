'use client'; // This is a client component because it uses hooks like useRouter and useAuth

import { useEffect } from 'react';
import { useRouter } from 'next/navigation'; // For App Router navigation
import { useAuth } from '@/lib/auth'; // Import the authentication hook

// Import the components for the dashboard
import DashboardHeader from '@/components/DashboardHeader';
import ProjectList from '@/components/ProjectList';
// import CreateProjectButton from '@/components/CreateProjectButton'; // Button might be in header

const DashboardPage = () => {
  const { isAuthenticated, isLoading } = useAuth(); // Get auth state from context
  const router = useRouter(); // Get router instance

  // Effect to check authentication status and redirect if not authenticated
  useEffect(() => {
    // Only redirect if loading is complete and user is NOT authenticated
    if (!isLoading && !isAuthenticated) {
      console.log("DashboardPage: Not authenticated, redirecting to home.");
      router.push('/login'); // Redirect to the home page if not logged in
    }
    // This effect depends on isLoading and isAuthenticated state changes
  }, [isAuthenticated, isLoading, router]); // Include router in dependencies

  // Show a loading state while the authentication status is being checked
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <p>Loading dashboard...</p> {/* Or a more sophisticated loading spinner */}
      </div>
    );
  }

  // If authenticated, render the dashboard content
  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6">
        {/* Dashboard Header with user info and create project button */}
        <DashboardHeader />

        {/* Main content area - Project List */}
        <main className="container mx-auto mt-8">
          <h2 className="text-3xl font-semibold mb-6 text-gray-800 dark:text-gray-200">Your Projects</h2>
          {/* Project List component will fetch and display projects */}
          <ProjectList />
        </main>
      </div>
    );
  }

  // If not authenticated and loading is complete, this return should technically not be reached
  // because of the redirect in useEffect, but including a fallback is good practice.
  return null; // Or a message indicating redirection
};

export default DashboardPage;
