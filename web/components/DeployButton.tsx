// web/components/DeployButton.tsx
'use client'; // This is a client component

import { useMutation, gql } from '@apollo/client';
import { Button } from '@/components/ui/button'; // Assuming shadcn button
import { toast } from 'sonner'; // Assuming sonner for notifications

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
  const [deployProjectMutation, { loading }] = useMutation(DEPLOY_PROJECT_MUTATION);
//   const { toast } = toast(); // Initialize toast

  // Function to handle clicking the deploy button
  const handleDeploy = async () => {
    console.log(`Attempting to deploy project ${projectId}...`);
    try {
      // Execute the deployProject mutation
      const { data } = await deployProjectMutation({
        variables: { projectId },
      });

      console.log("Deployment triggered successfully:", data?.deployProject);

      // Show a success toast
      toast("Deployment Triggered", {
        description: `Deployment #${data?.deployProject?.id} started with status: ${data?.deployProject?.status}.`,
        // type: "success",
      });

      // TODO: Optionally trigger a refetch of the project/deployment list
      // on the ProjectDetailPage after a short delay or on status change
      // This would involve passing a refetch function down from the page or using Apollo cache updates.

    } catch (error: any) {
      console.error("Error triggering deployment:", error);
      // Show an error toast
      toast("Deployment Failed", {
        description: error.message || "An error occurred while triggering the deployment.",
        // type: "error",
      });
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
