// web/components/DeploymentStatusDetails.tsx
'use client'; // This is a client component

import { useEffect, useRef, useState } from 'react'; // Import useEffect, useRef, and useState
import { useQuery, gql } from '@apollo/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // Shadcn card components
import { Badge } from '@/components/ui/badge'; // Shadcn badge for status
import { Skeleton } from '@/components/ui/skeleton'; // Shadcn skeleton for loading state
import { getStatusBadgeVariant, timeAgo } from '@/lib/utils'; // Assuming getStatusBadgeVariant and timeAgo are in utils
import Link from 'next/link'; // For back button
import { ArrowLeftIcon } from 'lucide-react'; // Icon for back button (install lucide-react)


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
      # updatedAt # Fetch updatedAt to potentially trigger log refetch
      errorMessage
      dockerfileUsed
      projectId # Fetch projectId to link back to the project page
      logFilePath # Fetch logFilePath to know if logs are available
    }
  }
`;

// GraphQL Query to fetch deployment logs
// This query should be defined in web/graphql/queries/getDeploymentLogs.graphql
const GET_DEPLOYMENT_LOGS = gql`
  query GetDeploymentLogs($id: Int!) {
    deploymentLogs(id: $id)
  }
`;

// Define the expected structure of a deployment object (matching the status query)
interface Deployment {
  id: number;
  status: string; // e.g., 'pending', 'deploying', 'success', 'failed'
  version?: string | null; // e.g., commit hash or version identifier
  deploymentUrl?: string | null; // Optional public URL
  createdAt: string; // When the deployment was created
  updatedAt: string; // When the deployment was last updated
  errorMessage?: string | null; // Error message if status is 'failed'
  dockerfileUsed?: string | null; // Which Dockerfile was used
  projectId: number; // ID of the associated project
  logFilePath?: string | null; // Path to the log file (indicates availability)
}


// Define props for the DeploymentStatusDetails component
interface DeploymentStatusDetailsProps {
  deploymentId: number; // The ID of the deployment to display
}

const DeploymentStatusDetails: React.FC<DeploymentStatusDetailsProps> = ({ deploymentId }) => {
  // Fetch the deployment status and details
  const { data: statusData, loading: statusLoading, error: statusError, stopPolling: stopStatusPolling } = useQuery(GET_DEPLOYMENT_STATUS, {
    variables: { id: deploymentId },
    pollInterval: 3000, // Poll status every 3 seconds
    // Optional: fetchPolicy: 'cache-and-network'
  });

  // Fetch deployment logs
  const { data: logsData, loading: logsLoading, error: logsError,  stopPolling: stopLogsPolling } = useQuery(GET_DEPLOYMENT_LOGS, {
      variables: { id: deploymentId },
      // Skip log query until logFilePath is available from statusData
      skip: !statusData?.deploymentStatus?.logFilePath,
      pollInterval: 1000, // Poll logs more frequently (e.g., every 1 second)
      // Optional: fetchPolicy: 'cache-and-network'
  });

  // Ref for the logs area to enable auto-scrolling
  const logAreaRef = useRef<HTMLDivElement>(null); // Changed ref type to HTMLDivElement for the container

  // State to track if the user has scrolled away from the bottom
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  // Effect to stop polling when deployment is in a final state or encounters an error
  useEffect(() => {
    const status = statusData?.deploymentStatus?.status;
    // Stop polling if status is success or failed
    if (status && (status === 'success' || status === 'failed')) {
      console.log(`Deployment ${deploymentId} reached final status: ${status}. Stopping polling.`);
      stopStatusPolling(); // Stop status polling
      stopLogsPolling(); // Stop log polling
    }
     // Also stop polling if there's a status error
     if (statusError) {
         console.error(`Status error for deployment ${deploymentId}. Stopping polling.`);
         stopStatusPolling();
         stopLogsPolling();
     }
     // Stop polling if deployment is not found (e.g., deleted)
     if (!statusLoading && !statusData?.deploymentStatus && !statusError) {
          console.log(`Deployment ${deploymentId} not found. Stopping polling.`);
          stopStatusPolling();
          stopLogsPolling();
     }

  }, [statusData, deploymentId, stopStatusPolling, stopLogsPolling, statusError, statusLoading]);


  // Effect to handle scroll event listener
  useEffect(() => {
      const logArea = logAreaRef.current;
      if (!logArea) return;

      const handleScroll = () => {
          // Check if the user is scrolled to the very bottom (within a small tolerance)
          const { scrollTop, clientHeight, scrollHeight } = logArea;
          const atBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 1; // Use a small tolerance

          setIsScrolledToBottom(atBottom);
      };

      logArea.addEventListener('scroll', handleScroll);

      // Clean up the event listener when the component unmounts or logArea changes
      return () => {
          logArea.removeEventListener('scroll', handleScroll);
      };
  }, []); // Re-run effect if the ref changes


  // Effect to auto-scroll logs to the bottom when new logs arrive, but only if scrolled to bottom
  useEffect(() => {
       const logArea = logAreaRef.current;
       // Only auto-scroll if the user hasn't scrolled up AND the log area exists
       if (logArea && isScrolledToBottom) {
           // Use a small delay to ensure the DOM has updated with new logs before scrolling
           const timeoutId = setTimeout(() => {
                logArea.scrollTop = logArea.scrollHeight;
           }, 50); // Small delay (e.g., 50ms)

           return () => clearTimeout(timeoutId); // Clean up timeout
       }
       // This effect should re-run when logsData changes (new logs) or isScrolledToBottom changes
  }, [logsData, isScrolledToBottom]);


  // Show loading state for the status
  if (statusLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Deployment #{deploymentId}</CardTitle>
          <CardDescription>Loading status...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
           <Skeleton className="h-6 w-3/4" />
           <Skeleton className="h-6 w-1/2" />
           <Skeleton className="h-6 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Show error state for the status fetch
  if (statusError) {
    console.error(`Error fetching deployment ${deploymentId} status:`, statusError);
    return (
      <Card className="w-full border-red-500">
        <CardHeader>
          <CardTitle className="text-red-500">Deployment #{deploymentId} - Error</CardTitle>
          <CardDescription>Failed to load deployment status.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">Error: {statusError.message}</p>
        </CardContent>
      </Card>
    );
  }

  // If status data is loaded
  const deployment: Deployment | null | undefined = statusData?.deploymentStatus;

  // Handle case where deployment is not found
  if (!deployment) {
       return (
           <Card className="w-full">
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

  // Get log content and loading/error states for logs
  const logContent = logsData?.deploymentLogs || 'Waiting for logs...';
  const currentLogState = logsLoading ? 'loading' : logsError ? 'error' : 'loaded';

  // Link back to the project detail page
  const projectDetailLink = `/projects/${deployment.projectId}`;


  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl font-semibold flex items-center gap-4">
            {/* Back button linking to the project page */}
            <Link href={projectDetailLink} className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
                 <ArrowLeftIcon className="h-5 w-5" /> {/* Back arrow icon */}
                 <span className="sr-only">Back to Project</span> {/* Screen reader text */}
            </Link>
            <h1>Deployment #{deployment.id}</h1>
        </CardTitle>
        <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            Triggered: {timeAgo(deployment.createdAt)}
             {/* Show last updated time if different from created time */}
             {deployment.createdAt !== deployment.createdAt && (
                  <span> (Last Updated: {timeAgo(deployment.createdAt)})</span>
             )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6"> {/* Increased spacing */}
        {/* Status and Basic Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> {/* Responsive grid */}
             {/* Status Badge */}
             <div className="flex items-center gap-2">
               <span className="text-sm font-medium">Status:</span>
               <Badge variant={getStatusBadgeVariant(deployment.status)}>
                 {deployment.status.toUpperCase()}
               </Badge>
             </div>

             {/* Dockerfile Used */}
             {deployment.dockerfileUsed && (
               <div className="text-sm flex items-center gap-2">
                 <span className="font-medium">Dockerfile:</span>{' '}
                 <span>{deployment.dockerfileUsed}</span>
               </div>
             )}

             {/* Version/Commit Hash */}
             {deployment.version && (
                 <div className="text-sm flex items-center gap-2">
                     <span className="font-medium">Version:</span>{' '}
                     <span className="font-mono">{deployment.version.slice(0, 7)}</span> {/* Display first 7 chars */}
                 </div>
             )}

             {/* Live URL (only if successful and URL exists) */}
             {deployment.status === 'success' && deployment.deploymentUrl && (
                 <div className="text-sm flex items-center gap-2">
                     <span className="font-medium">Live URL:</span>{' '}
                     <a href={deployment.deploymentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                       {deployment.deploymentUrl}
                     </a>
                 </div>
             )}
        </div>


        {/* Error Message (only if failed) */}
        {deployment.status === 'failed' && deployment.errorMessage && (
            <div className="text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-700 rounded-md"> {/* Styled error box */}
                <span className="font-medium">Error:</span> {deployment.errorMessage}
            </div>
        )}

        {/* --- Deployment Logs Section --- */}
        <div>
            <h3 className="text-lg font-semibold mb-2">Logs</h3>
            {currentLogState === 'loading' && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading logs...</p>
            )}
             {currentLogState === 'error' && (
                 <p className="text-sm text-red-500">Error loading logs.</p>
             )}
             {/* Display logs in a scrollable pre tag */}
             {/* Added scroll event listener to the container div */}
             <div
                 ref={logAreaRef}
                 className="bg-gray-800 text-gray-200 p-4 rounded-md overflow-y-auto overflow-x-auto text-sm max-h-80 font-mono" // Added overflow-y-auto
             >
                 {/* The pre tag itself doesn't need the ref for scrolling */}
                 <pre className="whitespace-pre-wrap break-words">{logContent}</pre>
             </div>
        </div>
        {/* --- End Deployment Logs Section --- */}


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
