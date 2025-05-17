// web/components/DeploymentItem.tsx
'use client'; // This is a client component

import Link from 'next/link'; // For linking to the deployment URL
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; // Shadcn card components
import { Button } from '@/components/ui/button'; // Shadcn button
import { Badge } from '@/components/ui/badge'; // Shadcn badge for status
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'; // Shadcn dropdown menu
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline'; // Example icon (install @heroicons/react)
import { useMutation, gql } from '@apollo/client'; // For potential future mutations (e.g., redeploy, delete)
import { toast } from 'sonner'; // Assuming sonner for notifications
import { timeAgo, getStatusBadgeVariant } from '@/lib/utils';

// Define the expected structure of a deployment object
interface Deployment {
  id: number;
  status: string; // e.g., 'pending', 'deploying', 'success', 'failed'
  version: string; // e.g., commit hash
  deploymentUrl?: string | null; // Optional public URL
  createdAt: string; // When the deployment was created
  errorMessage?: string | null; // Error message if failed
}

// Define props for the DeploymentItem component
interface DeploymentItemProps {
  deployment: Deployment; // The deployment data to display
  onDeploymentAction?: () => void; // Optional callback to refetch deployments after an action
}



// Placeholder mutation for future redeploy functionality
const REDEPLOY_MUTATION = gql`
  mutation Redeploy($deploymentId: Int!) {
    redeploy(deploymentId: $deploymentId) {
      id
      status
    }
  }
`;

// Placeholder mutation for future delete functionality
const DELETE_DEPLOYMENT_MUTATION = gql`
  mutation DeleteDeployment($deploymentId: Int!) {
    deleteDeployment(deploymentId: $deploymentId) {
      id
    }
  }
`;


const DeploymentItem: React.FC<DeploymentItemProps> = ({ deployment, onDeploymentAction }) => {
    // const { toast } = useToast(); // Initialize toast

    // Placeholder mutation hooks
    const [redeployMutation, { loading: redeployLoading }] = useMutation(REDEPLOY_MUTATION);
    const [deleteDeploymentMutation, { loading: deleteLoading }] = useMutation(DELETE_DEPLOYMENT_MUTATION);

    // Function to handle redeploying a deployment
    const handleRedeploy = async () => {
        console.log(`Attempting to redeploy deployment ${deployment.id}...`);
        // TODO: Implement redeploy mutation call here
        try {
            await redeployMutation({ variables: { deploymentId: deployment.id } });
            toast("Redeployment Triggered", {
                 description: `Redeploying deployment ${deployment.id}.`,
                //  type: "info",
            });
            if (onDeploymentAction) {
                onDeploymentAction(); // Refetch list to show new pending deployment
            }
            //@ts-ignore
        } catch (error: any) {
             console.error("Failed to trigger redeploy:", error);
             toast("Redeploy Failed", {
                 description: error.message || "An error occurred while triggering redeploy.",
                //  type: "error",
             });
        }
    };

    // Function to handle deleting a deployment
    const handleDelete = async () => {
        console.log(`Attempting to delete deployment ${deployment.id}...`);
         // TODO: Implement delete mutation call here
         if (!confirm(`Are you sure you want to delete deployment ${deployment.id}?`)) {
             return; // User cancelled
         }
         try {
             await deleteDeploymentMutation({ variables: { deploymentId: deployment.id } });
             toast("Deployment Deleted", {
                  description: `Deployment ${deployment.id} deleted successfully.`,
                //   type: "success",
             });
             if (onDeploymentAction) {
                 onDeploymentAction(); // Refetch list after deletion
             }
             //@ts-ignore
         } catch (error: any) {
              console.error("Failed to delete deployment:", error);
              toast("Delete Failed", {
                  description: error.message || "An error occurred while deleting the deployment.",
                //   type: "error",
              });
         }
    };

    const deploymentDetailLink = `/deployments/${deployment.id}`

  return (
    <Card className="flex flex-col justify-between"> {/* Flex column layout */}
      <CardHeader>
        <div className="flex items-center justify-between">
          {/* Deployment Version/ID */}
          <Link href={deploymentDetailLink} className='"hover:underline"'>
            <CardTitle className="text-lg font-mono truncate">
              Deployment #{deployment.id} - <span className="text-sm text-gray-500 dark:text-gray-400">{deployment.version.slice(0, 7)}</span> {/* Display first 7 chars of version */}
            </CardTitle>
          </Link>
          {/* Options Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open deployment options</span>
                {/* Icon for the options button */}
                <EllipsisVerticalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Deployment Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* Dropdown Menu Items */}
              {deployment.deploymentUrl && deployment.status === 'success' && (
                <DropdownMenuItem asChild> {/* Use asChild to make Link work inside DropdownMenuItem */}
                   {/* Link to the live deployment URL */}
                  <a href={deployment.deploymentUrl} target="_blank" rel="noopener noreferrer">View Live</a>
                </DropdownMenuItem>
              )}
              {/* Redeploy option - might be disabled based on status */}
              <DropdownMenuItem onClick={handleRedeploy} disabled={redeployLoading}>Redeploy</DropdownMenuItem>
              {/* Delete option */}
              <DropdownMenuItem onClick={handleDelete} disabled={deleteLoading}>Delete</DropdownMenuItem>
              {/* Add other actions like View Logs (future) */}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Display creation time */}
         <CardDescription className="text-xs text-gray-500 dark:text-gray-400">
             {timeAgo(deployment.createdAt)} {/* Format date and time */}
         </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Display deployment status badge */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <Badge variant={getStatusBadgeVariant(deployment.status)}>
            {deployment.status.toUpperCase()}
          </Badge>
        </div>
        {/* Display error message if failed */}
        {deployment.status === 'failed' && deployment.errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2">Error: {deployment.errorMessage}</p>
        )}
      </CardContent>
      {/* Optional: Footer for additional info or actions */}
      {/* <CardFooter></CardFooter> */}
    </Card>
  );
};

export default DeploymentItem;
