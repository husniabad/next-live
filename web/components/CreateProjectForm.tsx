// web/components/CreateProjectForm.tsx
'use client'; // This is a client component

import { useState } from 'react';
import { useMutation, gql } from '@apollo/client';
import { Button } from '@/components/ui/button'; // Shadcn button
import { Input } from '@/components/ui/input'; // Shadcn input
import { Label } from '@/components/ui/label'; // Shadcn label
import RepoList from './RepoList'; // Import the RepoList component
// Import the sonner toast function instead of useToast hook
import { toast } from 'sonner'; // Assuming you have installed and set up sonner
import { DialogFooter } from '@/components/ui/dialog'; // Shadcn dialog footer

// GraphQL Mutation to create a new project
const CREATE_PROJECT_MUTATION = gql`
  mutation CreateProject($name: String!, $gitRepoUrl: String!) {
    createProject(name: $name, gitRepoUrl: $gitRepoUrl) {
      id
      name
      gitRepoUrl
      createdAt
      # Fetch any other fields you need after creation, e.g.,
      # latestDeployment {
      #   id
      #   status
      # }
    }
  }
`;

// Define props for the form
interface CreateProjectFormProps {
  onSuccess?: () => void; // Optional callback to run after successful project creation
}

const CreateProjectForm: React.FC<CreateProjectFormProps> = ({ onSuccess }) => {
  const [projectName, setProjectName] = useState(''); // State for project name input
  const [selectedRepoUrl, setSelectedRepoUrl] = useState(''); // State for selected repository URL
  const [createProjectMutation, { loading, error }] = useMutation(CREATE_PROJECT_MUTATION); // Apollo mutation hook
  // Removed useToast hook - using the toast function directly from sonner
  // const { toast } = useToast(); // Hook to display toasts

  // Function to handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default form submission

    if (!projectName || !selectedRepoUrl) {
      // Use the sonner toast function
      toast("Missing Information", { // Title is the first argument
        description: "Please enter a project name and select a repository.",

        // type: "error", // use toast.error
      });
      return;
    }

    try {
      // Execute the create project mutation
      const { data } = await createProjectMutation({
        variables: { name: projectName, gitRepoUrl: selectedRepoUrl },
      });

      console.log("Project created successfully:", data?.createProject);

      // Use the sonner toast function for success
      toast("Project Created", { // Title
        description: `Project "${data?.createProject?.name}" created successfully.`,
        // type: "success", // Using type for styling,,
      });

      // Call the onSuccess callback if provided
      if (onSuccess) {
        onSuccess(); // Close the modal or perform other actions
      }

      // Optional: Clear form fields
      setProjectName('');
      setSelectedRepoUrl('');

    } catch (err: any) {
      console.error("Error creating project:", err);
      // Use the sonner toast function for error
      toast("Project Creation Failed", { // Title
        description: err.message || "An error occurred while creating the project.",
        // type: "error", // use toast.success
      });
    }
  };

  // Function to handle repository selection from the RepoList component
  const handleRepoSelect = (repoUrl: string) => {
    setSelectedRepoUrl(repoUrl);
    // Optional: Automatically set project name based on repo name?
    // setProjectName(repoUrl.split('/').pop()?.replace('.git', '') || '');
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 py-4">
        {/* Project Name Input */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="projectName" className="text-right">
            Project Name
          </Label>
          <Input
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="col-span-3"
            required // Make input required
          />
        </div>

        {/* Repository Selection */}
        <div className="grid grid-cols-4 items-start gap-4"> {/* Align to top */}
           <Label className="text-right mt-2"> {/* Adjust label alignment */}
             Repository
           </Label>
           {/* RepoList component for selecting a repository */}
           {/* Pass the selection handler and the currently selected URL */}
           <div className="col-span-3 max-h-60 overflow-y-auto border rounded-md p-2"> {/* Added scroll and border */}
             <RepoList onRepoSelect={handleRepoSelect} selectedRepoUrl={selectedRepoUrl} />
           </div>
        </div>
         {/* Display selected repo URL */}
         {selectedRepoUrl && (
             <div className="grid grid-cols-4 items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                 <span className="text-right">Selected:</span>
                 <span className="col-span-3 truncate">{selectedRepoUrl}</span>
             </div>
         )}
      </div>
      <DialogFooter>
        {/* Submit Button */}
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Project'}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default CreateProjectForm;
