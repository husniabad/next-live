// web/components/CreateProjectButton.tsx
'use client'; // This is a client component

import { useState } from 'react';
import { Button } from '@/components/ui/button'; // Assuming shadcn button
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'; // Shadcn dialog for modal
import CreateProjectForm from './CreateProjectForm'; // Import the Create Project Form component

// This component is a button that triggers a modal/dialog
// containing the form to create a new project.

const CreateProjectButton = () => {
  const [isModalOpen, setIsModalOpen] = useState(false); // State to manage modal visibility

  // Function to close the modal
  const handleModalClose = () => {
    setIsModalOpen(false);
    // Optional: Call onProjectCreated from ProjectList here if needed to refresh the list
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}> {/* Control dialog state */}
      <DialogTrigger asChild>
        {/* The button that opens the dialog */}
        <Button>Create New Project</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]"> {/* Adjust modal width */}
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Enter project details and select a repository.
          </DialogDescription>
        </DialogHeader>
        {/* The Create Project Form component goes inside the dialog content */}
        {/* Pass a callback to the form to close the modal after submission */}
        <CreateProjectForm onSuccess={handleModalClose} />
      </DialogContent>
    </Dialog>
  );
};

export default CreateProjectButton;
