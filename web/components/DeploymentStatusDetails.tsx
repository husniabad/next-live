// web/components/DeploymentStatusDetails.tsx
'use client'; // This is a client component

import { useQuery, gql } from '@apollo/client';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'; // Shadcn card components
import { Badge } from '@/components/ui/badge'; // Shadcn badge for status
import { Skeleton } from '@/components/ui/skeleton'; // Shadcn skeleton for loading state
import { getStatusBadgeVariant, timeAgo } from '@/lib/utils';
import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// GraphQL Query to fetch a single deployment's status and details
// This query is defined in web/graphql/queries/getDeploymentStatus.graphql
const GET_DEPLOYMENT_STATUS = gql`
  query GetDeploymentStatus($id: Int!) {
    deploymentStatus(id: $id) {
      id
      status
      version
      deploymentUrl
      createdAt
      errorMessage
      dockerfileUsed
      projectId
    }
  }
`;

// Define props for the DeploymentStatusDetails component
interface DeploymentStatusDetailsProps {
  deploymentId: number; // The ID of the deployment to display
}

const DeploymentStatusDetails: React.FC<DeploymentStatusDetailsProps> = ({
  deploymentId,
}) => {
  // Fetch the deployment status and details
  // Use pollInterval to update the status in real-time
  const { data, loading, error, stopPolling } = useQuery(
    GET_DEPLOYMENT_STATUS,
    {
      variables: { id: deploymentId }, // Pass the deployment ID
      pollInterval: 3000, // Poll every 3 seconds to get status updates
      // Optional: fetchPolicy: 'cache-and-network' // Get from cache immediately, then update from network
    }
  );

  useEffect(() => {
    const status = data?.deploymentStatus?.status;
    // Check if status is loaded and is either 'success' or 'failed'
    if (status && (status === 'success' || status === 'failed')) {
      console.log(
        `Deployment ${deploymentId} reached final status: ${status}. Stopping polling.`
      );
      stopPolling(); // Call stopPolling to stop the interval
    }
    // This effect should re-run whenever the data (and thus status) changes
  }, [data, deploymentId, stopPolling]); // Include dependencies


  // Show loading state
  if (loading) {
    return (
      <Card className='w-full'>
        <CardHeader>
          <CardTitle>Deployment #{deploymentId}</CardTitle>
          <CardDescription>Loading status...</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          <Skeleton className='h-6 w-3/4' />
          <Skeleton className='h-6 w-1/2' />
          <Skeleton className='h-6 w-full' />
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (error) {
    console.error(`Error fetching deployment ${deploymentId} status:`, error);
    return (
      <Card className='w-full border-red-500'>
        <CardHeader>
          <CardTitle className='text-red-500'>
            Deployment #{deploymentId} - Error
          </CardTitle>
          <CardDescription>Failed to load deployment status.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-red-500'>Error: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  // If data is loaded
  const deployment = data?.deploymentStatus;

  // Handle case where deployment is not found (though GraphQL might throw an error first)
  if (!deployment) {
    return (
      <Card className='w-full'>
        <CardHeader>
          <CardTitle>Deployment #{deploymentId}</CardTitle>
          <CardDescription>Deployment not found.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>The requested deployment could not be found.</p>
        </CardContent>
      </Card>
    );
  }
  const projectIdLink = `/projects/${deployment.projectId}`

  return (
    <Card className='w-full'>
      <CardHeader>
        <CardTitle className='text-xl font-semibold flex gap-4 items-center'>
          <Link href={`${projectIdLink}`}><ArrowLeft /></Link><h1>Deployment #{deployment.id}</h1>
        </CardTitle>
        <CardDescription className='text-sm text-gray-500 dark:text-gray-400'>
          Triggered: {timeAgo(deployment.createdAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-medium'>Status:</span>
          <Badge variant={getStatusBadgeVariant(deployment.status)}>
            {deployment.status.toUpperCase()}
          </Badge>
        </div>

        {/* Version/Commit Hash */}
        {deployment.version && (
          <div className='text-sm'>
            <span className='font-medium'>Version:</span>{' '}
            <span className='font-mono'>{deployment.version}</span>
          </div>
        )}

        {/* Dockerfile Used */}
        {deployment.dockerfileUsed && (
          <div className='text-sm'>
            <span className='font-medium'>Dockerfile:</span>{' '}
            <span>{deployment.dockerfileUsed}</span>
          </div>
        )}

        {/* Live URL (only if successful and URL exists) */}
        {deployment.status === 'success' && deployment.deploymentUrl && (
          <div className='text-sm'>
            <span className='font-medium'>Live URL:</span>{' '}
            <a
              href={deployment.deploymentUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='text-blue-500 hover:underline'>
              {deployment.deploymentUrl}
            </a>
          </div>
        )}

        {/* Error Message (only if failed) */}
        {deployment.status === 'failed' && deployment.errorMessage && (
          <div className='text-sm text-red-600 dark:text-red-400'>
            <span className='font-medium'>Error:</span>{' '}
            {deployment.errorMessage}
          </div>
        )}

        {/* TODO: Add progress indicator or logs streaming here in the future */}
      </CardContent>
      {/* Optional: Add CardFooter for actions like Redeploy/Delete */}
      {/* These actions could also be placed here instead of or in addition to the ProjectItem dropdown */}
      {/*
      <CardFooter>
           <Button variant="outline" disabled={loading || deployment.status === 'deploying' || deployment.status === 'pending'}>Redeploy</Button>
           <Button variant="destructive" disabled={loading || deployment.status === 'deploying' || deployment.status === 'pending'}>Delete</Button>
      </CardFooter>
      */}
    </Card>
  );
};

export default DeploymentStatusDetails;
