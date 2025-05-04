// web/components/ProjectItem.tsx
'use client'; // This is a client component

import Link from 'next/link'; // For linking to the project detail page
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'; // Shadcn card components
import { Button } from '@/components/ui/button'; // Shadcn button
import { Badge } from '@/components/ui/badge'; // Shadcn badge for status
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'; // Shadcn dropdown menu
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline'; // Example icon (install @heroicons/react)
import { timeAgo } from '@/lib/utils';

// Define the expected structure of a project object
interface Project {
  id: number;
  name: string;
  gitRepoUrl: string;
  createdAt: string; // Assuming createdAt is a string (like ISO date)
  deployments?: Array<{ // Optional latest deployment details
    id: number;
    status: string;
    createdAt: string;
    deploymentUrl?: string; // Optional URL
  }> | null;
}

// Define props for the ProjectItem component
interface ProjectItemProps {
  project: Project; // The project data to display
  onProjectUpdated?: () => void; // Optional callback to refetch the project list
}

// Helper function to determine badge color based on deployment status
const getStatusBadgeVariant = (status?: string | null) => {
  switch (status) {
    case 'success':
      return 'default'; // Greenish color by default in shadcn
    case 'failed':
      return 'destructive'; // Red color
    case 'deploying':
    case 'pending':
      return 'secondary'; // Grayish color
    default:
      return 'outline'; // Default outline for no status
  }
};

const ProjectItem: React.FC<ProjectItemProps> = ({ project, onProjectUpdated }) => {

    // Function to handle triggering a new deployment (placeholder)
    const handleDeploy = () => {
        console.log(`Attempting to deploy project ${project.id}...`);
        // TODO: Implement mutation call to deployProject here
        // After mutation, call onProjectUpdated if provided to refresh the list
        // Example:
        /*
        deployProjectMutation({ variables: { projectId: project.id } })
          .then(() => {
            console.log("Deployment triggered successfully.");
            if (onProjectUpdated) {
              onProjectUpdated(); // Refresh the list
            }
          })
          .catch(error => {
            console.error("Failed to trigger deployment:", error);
            // Show an error message to the user
          });
        */
       alert(`Deploying project: ${project.name} (ID: ${project.id})\n(Deployment logic not fully implemented yet)`);
       // Simulate a status change for demo purposes (remove in real implementation)
       // This requires managing state in ProjectList or using optimistic updates
    };

    // Function to handle navigating to the project detail page
    // We use Next.js Link component for client-side navigation
    const projectDetailLink = `/projects/${project.id}`;


  return (
    <Card className="flex flex-col justify-between"> {/* Flex column to push footer down */}
      <CardHeader>
        <div className="flex items-center justify-between">
          {/* Link the title to the project detail page */}
          <Link href={projectDetailLink} className='"hover:underline"'>
              <CardTitle className="text-xl">{project.name}</CardTitle>
          </Link>
          {/* Options Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                {/* Icon for the options button */}
                <EllipsisVerticalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* Dropdown Menu Items */}
              <DropdownMenuItem > {/* Use asChild to make Link work inside DropdownMenuItem */}
                 <Link href={projectDetailLink}>View Details</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDeploy}>Deploy Now</DropdownMenuItem> {/* Trigger deploy function */}
              {/* Add other actions like Delete, Settings, etc. */}
              {/* <DropdownMenuItem>Delete Project</DropdownMenuItem> */}
              <DropdownMenuItem > {/* Use asChild to make Link work inside DropdownMenuItem */}
                 <Link href={projectDetailLink}>Delete</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CardDescription className="text-sm text-gray-500 dark:text-gray-400 truncate">{project.gitRepoUrl}</CardDescription> {/* Truncate long URLs */}
      </CardHeader>
      <CardContent>
        {/* Display latest deployment status */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Deployments:</span>
          {project.deployments &&
          <Badge variant={getStatusBadgeVariant(project.deployments[0]?.status)}>
            {project.deployments.length ? project.deployments.length: 'NO'} DEPLOYMENTS
          </Badge>}
        </div>
        {/* Display last deployed time if available */}
        {project.deployments && project.deployments?.length > 0  && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Last deployment : {timeAgo(Number(project.deployments.reduce((a, b) => Number(a.createdAt) > Number(b.createdAt) ? a : b).createdAt))}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
         <span>Created: {timeAgo(Number(project.createdAt))}</span> {/* Display creation date */}
         {project.deployments
         && 
          project.deployments[0]?.status === 'success' && project.deployments[0]?.deploymentUrl && (
              <Link href={project.deployments[0].deploymentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                  View Live
              </Link>
          )
         }
      </CardFooter>
    </Card>
  );
};

export default ProjectItem;
