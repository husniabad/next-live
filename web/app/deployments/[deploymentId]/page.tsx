// web/app/deployments/[deploymentId]/page.tsx
'use client'; // This is a client component

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation'; // For App Router navigation and params
import { useAuth } from '@/lib/auth'; // Import the authentication hook
import DeploymentStatusDetails from '@/components/DeploymentStatusDetails'; // Import the DeploymentStatusDetails component


const DeploymentDetailPage = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth(); // Get auth state
  const router = useRouter(); // Get router instance
  const params = useParams(); // Get route parameters
  // Extract and parse the deployment ID from the URL params
  const deploymentId = params.deploymentId ? parseInt(params.deploymentId as string, 10) : null;

  // Effect to check authentication status and redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      console.log("DeploymentDetailPage: Not authenticated, redirecting to home.");
      router.push('/'); // Redirect to the home page if not logged in
    }
  }, [isAuthenticated, authLoading, router]);

  // Show a loading state while the authentication status is being checked
  if (authLoading || deploymentId === null) {
      return (
          <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
              <p>Loading deployment page...</p> {/* Or a loading spinner */}
          </div>
      );
  }

  // If authenticated and deploymentId is available, render the page content
  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6">
        {/* Back button */}
        
        {/* Deployment Details Section */}
          <h2 className="text-3xl font-semibold mb-6 text-gray-800 dark:text-gray-200">Deployment Details</h2>
          {/* Render the DeploymentStatusDetails component */}
          {/* Pass the extracted deployment ID to it */}
          <DeploymentStatusDetails deploymentId={deploymentId} />
        </div>
    );
  }

  // If not authenticated and loading is complete, this return should technically not be reached
  // because of the redirect in useEffect, but including a fallback is good practice.
  return null; // Or a message indicating redirection
};

export default DeploymentDetailPage;
