// web/components/DeployButton.tsx
'use client'; // This is a client component

import { useMutation, gql } from '@apollo/client';
import { Button } from '@/components/ui/button'; // Assuming shadcn button
// Import the toast object from sonner
import { toast } from 'sonner'; // Assuming sonner for notifications
import { useRouter } from 'next/navigation'; // Import useRouter for navigation

// GraphQL Mutation to trigger a project deployment
const DEPLOY_PROJECT_MUTATION = gql`
  mutation DeployProject($projectId: Int!) {
    deployProject(projectId: $projectId) {
      id
      status # Should return 'pending' initially
    }
  }
`;

// Define props for the DeployButton component
interface DeployButtonProps {
  projectId: number; // The ID of the project to deploy
}

const DeployButton: React.FC<DeployButtonProps> = ({ projectId }) => {
  const router = useRouter(); // Initialize router for navigation
  const [deployProjectMutation, { loading }] = useMutation(DEPLOY_PROJECT_MUTATION);
  // No need for useToast hook if using the direct methods
  // const { toast } = useToast(); // Initialize toast

  // Function to handle clicking the deploy button
  const handleDeploy = async () => {
    console.log(`Attempting to deploy project ${projectId}...`);
    try {
      // Execute the deployProject mutation
      const { data } = await deployProjectMutation({
        variables: { projectId },
      });

      const newDeploymentId = data?.deployProject?.id;
      const initialStatus = data?.deployProject?.status;

      console.log(`Deployment triggered successfully. New Deployment ID: ${newDeploymentId}, Status: ${initialStatus}`);

      // --- Use toast.success() for success messages ---
      toast.success("Deployment Triggered", {
        description: `Deployment #${newDeploymentId} started with status: ${initialStatus}.`,
        // type: "success", // Removed type property as it's implicit with toast.success
      });
      // --- End toast.success() ---


      // Navigate to the specific deployment status page
      if (newDeploymentId) {
          router.push(`/deployments/${newDeploymentId}`);
      } else {
          // --- Use toast.warning() for warning messages ---
           toast.warning("Deployment Triggered", {
               description: "Deployment triggered, but could not get deployment ID for status page.",
               // type: "warning", // Removed type property as it's implicit with toast.warning
           });
           // --- End toast.warning() ---
      }

      // @ts-ignore
    } catch (error: any) {
      console.error("Error triggering deployment:", error);
      // --- Use toast.error() for error messages ---
      toast.error("Deployment Failed", {
        description: error.message || "An error occurred while triggering the deployment.",
        // type: "error", // Removed type property as it's implicit with toast.error
      });
      // --- End toast.error() ---
    }
  };

  return (
    // Render the button
    <Button onClick={handleDeploy} disabled={loading}>
      {loading ? 'Deploying...' : 'Deploy Project'}
    </Button>
  );
};

export default DeployButton;
