// web/app/projects/[projectId]/page.tsx
'use client'; // This is a client component

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation'; // For App Router navigation and params
import { useAuth } from '@/lib/auth'; // Import the authentication hook
import { useQuery, gql } from '@apollo/client'; // For fetching project details
import DeploymentList from '@/components/DeploymentList'; // Import the DeploymentList component
import { Button } from '@/components/ui/button'; // Assuming shadcn button
import Link from 'next/link'; // For back button
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'; // Shadcn card components
import DeployButton from '@/components/DeployButton'; // Import the DeployButton component
import { timeAgo } from '@/lib/utils';

// GraphQL Query to fetch a single project's details (excluding deployments, as DeploymentList fetches them)
// We might still need some basic project info here.
// Alternatively, the GET_PROJECT_WITH_DEPLOYMENTS query from DeploymentList could be used here,
// and the project details extracted from its result. Let's use a separate query for clarity.
const GET_PROJECT_DETAILS = gql`
  query GetProjectDetails($projectId: Int!) {
    project(id: $projectId) {
      id
      name
      gitRepoUrl
      createdAt
      # Fetch other project-specific details needed on this page
    }
  }
`;

const ProjectDetailPage = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth(); // Get auth state
  const router = useRouter(); // Get router instance
  const params = useParams(); // Get route parameters
  const projectId = params.projectId
    ? parseInt(params.projectId as string, 10)
    : null; // Extract and parse project ID

  // Effect to check authentication status and redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      console.log('ProjectDetailPage: Not authenticated, redirecting to home.');
      router.push('/'); // Redirect to the home page if not logged in
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch project details using the GET_PROJECT_DETAILS query
  const {
    data,
    loading: queryLoading,
    error,
  } = useQuery(GET_PROJECT_DETAILS, {
    variables: { projectId: projectId as number }, // Pass the parsed project ID
    skip: authLoading || !isAuthenticated || projectId === null, // Skip query if not authenticated or project ID is missing
  });

  // Show loading state for the page
  if (authLoading || queryLoading || projectId === null) {
    return (
      <div className='flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100'>
        <p>Loading project details...</p> {/* Or a loading spinner */}
      </div>
    );
  }

  // Show error state if fetching project details failed
  if (error) {
    console.error(`Error fetching project ${projectId} details:`, error);
    return (
      <div className='p-6'>
        <p className='text-red-500'>
          Error loading project details: {error.message}
        </p>
      </div>
    );
  }

  // If authenticated and project data is loaded
  const project = data?.project;

  // Handle case where project is not found (though GraphQL might throw an error first)
  if (!project) {
    return (
      <div className='p-6'>
        <p className='text-red-500'>Project not found.</p>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6'>
      {/* Back button */}
      <div className='mb-6'>
        <Link href='/'>
          <Button variant='outline'>← Back to Dashboard</Button>{' '}
          {/* Shadcn button with outline variant */}
        </Link>
      </div>

      {/* Project Details Header */}
      <div className='container mx-auto mb-8'>
        <Card>
          <CardHeader>
            <CardTitle className='text-2xl font-semibold'>
              {project.name}
            </CardTitle>
            <CardDescription className='text-gray-600 dark:text-gray-400 truncate'>
              {project.gitRepoUrl}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex justify-between items-center'>
            <p className='text-sm text-gray-500 dark:text-gray-400'>
              Created: {timeAgo(project.createdAt)}
            </p>
            {/* Deploy Button for this project */}
            {/* Pass the project ID to the DeployButton component */}
            <DeployButton projectId={project.id} />
          </CardContent>
        </Card>
      </div>

      {/* Deployments List Section */}
      <div className='container mx-auto'>
        <h2 className='text-3xl font-semibold mb-6 text-gray-800 dark:text-gray-200'>
          Deployments
        </h2>
        {/* Render the DeploymentList component */}
        {/* Pass the project ID so it can fetch the deployments */}
        <DeploymentList projectId={project.id} />
      </div>
    </div>
  );
};

export default ProjectDetailPage;
