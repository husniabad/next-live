// web/components/DeploymentList.tsx
'use client'; // This is a client component

import { useQuery, gql } from '@apollo/client';
import DeploymentItem from './DeploymentItem'; // Import the single deployment item component
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Assuming shadcn card
import { Skeleton } from '@/components/ui/skeleton'; // Assuming shadcn skeleton for loading state

// GraphQL Query to fetch a single project and its deployments
// This query is defined in web/graphql/queries/getProject.graphql
const GET_PROJECT_WITH_DEPLOYMENTS = gql`
  query GetProjectWithDeployments($projectId: Int!) {
    project(id: $projectId) {
      id
      name
      # We only need the deployments list here, project details are displayed elsewhere on the page
      deployments {
        id
        status
        version
        deploymentUrl
        createdAt
        errorMessage
      }
    }
  }
`;

// Define props for the DeploymentList component
interface DeploymentListProps {
  projectId: number; // The ID of the project whose deployments to list
}

const DeploymentList: React.FC<DeploymentListProps> = ({ projectId }) => {
  // Fetch the project data including its deployments
  const { data, loading, error, refetch } = useQuery(GET_PROJECT_WITH_DEPLOYMENTS, {
    variables: { projectId }, // Pass the project ID as a variable
    // Optional: pollInterval: 5000, // Poll every 5 seconds to update status automatically
    // Optional: fetchPolicy: 'cache-and-network' // Get from cache immediately, then update from network
  });

  // Show loading state
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
         {/* Render skeleton loaders while loading */}
         {[...Array(3)].map((_, i) => (
             <Skeleton key={i} className="h-[150px] w-full rounded-xl" />
         ))}
      </div>
    );
  }

  // Show error state
  if (error) {
    console.error(`Error fetching deployments for project ${projectId}:`, error);
    return <p className="text-red-500">Error loading deployments: {error.message}</p>;
  }

  // If data is loaded and there are no deployments
  const deployments = data?.project?.deployments || [];

  if (deployments.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>No Deployments Yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This project has no deployments. Trigger one to get started!</p>
          {/* The Deploy button is likely on the main project page */}
        </CardContent>
      </Card>
    );
  }

  // If deployments are loaded, render the list
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"> {/* Responsive grid layout */}
      {
      //@ts-ignore
      deployments.map((deployment: any) => ( // Map over the deployments data
        // Render a DeploymentItem component for each deployment
        // Pass deployment data and the refetch function (for polling or action updates)
        <DeploymentItem key={deployment.id} deployment={deployment} onDeploymentAction={refetch} />
      ))}
    </div>
  );
};

export default DeploymentList;
