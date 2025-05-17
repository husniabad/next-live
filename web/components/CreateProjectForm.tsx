// web/components/CreateProjectForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { useMutation, gql, useQuery } from '@apollo/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Search, ChevronsUpDown, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';

// GraphQL Mutation to create a new project
const CREATE_PROJECT_MUTATION = gql`
  mutation CreateProject($name: String!, $gitRepoUrl: String!) {
    createProject(name: $name, gitRepoUrl: $gitRepoUrl) {
      id
      name
      gitRepoUrl
      createdAt
    }
  }
`;

// GraphQL Query to fetch the list of user's repositories
const GET_REPOSITORIES = gql`
  query GetRepositories {
    repositories {
      name
      html_url
      description
      size
      clone_url
      full_name
    }
  }
`;

interface Repository {
  name: string;
  full_name: string;
  description: string;
  size:number;
  html_url: string;
  clone_url:string;
}

interface CreateProjectFormProps {
  onSuccess?: () => void;
}

const CreateProjectForm: React.FC<CreateProjectFormProps> = ({ onSuccess }) => {
  const router = useRouter()
  const [projectName, setProjectName] = useState('');
  const [selectedRepoUrl, setSelectedRepoUrl] = useState('');
  const [isRepoDialogOpen, setIsRepoDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch repositories
  const { data: reposData, loading: reposLoading, error: reposError } = useQuery(GET_REPOSITORIES);
  
  // Create project mutation
  const [createProject, { loading: createLoading }] = useMutation(CREATE_PROJECT_MUTATION);

  // Set project name from selected repo
  useEffect(() => {
    if (selectedRepoUrl 
      // && !projectName
    ) {
      const selectedRepo = reposData?.repositories?.find((repo: Repository) => repo.clone_url === selectedRepoUrl);
      if (selectedRepo) {
        setProjectName(selectedRepo.name.replace(/\.git$/, '').replace(/-/g, " ").replace(/\b\w/g, (c:string)=> c.toUpperCase()));
      }
    }
  }, [selectedRepoUrl, 
    // projectName, 
    reposData]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectName || !selectedRepoUrl) {
      toast.error("Please enter a project name and select a repository.");
      return;
    }

    try {
      const { data } = await createProject({
        variables: { name: projectName, gitRepoUrl: selectedRepoUrl },
      });

      toast.success(`Project "${data?.createProject?.name}" created successfully.`);
      
      if (onSuccess) onSuccess();

      setProjectName('');
      setSelectedRepoUrl('');
      setSearchTerm('');
      setIsRepoDialogOpen(false);
      router.push(`projects/${data?.createProject?.id}`)
      //@ts-ignore
    } catch (err: any) {
      console.error("Error creating project:", err);
      toast.error(err.message || "An error occurred while creating the project.");
    }
  };

  // Filter repositories based on search term
  const filteredRepos = reposData?.repositories?.filter((repo: Repository) =>
    repo.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get selected repo details
  const selectedRepo = reposData?.repositories?.find((repo: Repository) => repo.clone_url === selectedRepoUrl);

  console.log('selected trpo',selectedRepo)
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
            required
          />
        </div>

        {/* Repository Selection */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">
            Repository
          </Label>
          <div className="col-span-3">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              onClick={() => {
                setSearchTerm('');
                setIsRepoDialogOpen(true);
              }}
              // disabled={reposLoading || reposError}
            >
              {selectedRepo ? selectedRepo.full_name : "Select repository..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              
            </Button>
          </div>
        </div>
      </div>

      {/* Repository Selection Dialog */}
      <Dialog open={isRepoDialogOpen} onOpenChange={setIsRepoDialogOpen}>
        <DialogContent 
          className="sm:max-w-[600px] max-h-[80vh] flex flex-col overflow-hidden"
          onInteractOutside={(e) => {
            const triggerButton = document.querySelector('button[aria-expanded="true"]');
            if (triggerButton && triggerButton.contains(e.target as Node)) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Select a Repository</DialogTitle>
          </DialogHeader>
          
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search repositories..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Repository List */}
          <ScrollArea className="flex-1 border rounded-md mt-4 overflow-y-auto">
            {reposLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : reposError ? (
              <div className="p-4 text-center text-red-500">
                Error loading repositories.
              </div>
            ) : (
              <div className="divide-y">
                {filteredRepos?.length ? (
                  filteredRepos.map((repo: Repository) => (
                    <button
                      type="button"
                      key={repo.html_url}
                      className={cn(
                        "w-full p-4 hover:bg-accent cursor-pointer flex items-center text-left",
                        selectedRepoUrl === repo.clone_url && "bg-accent"
                      )}
                      onClick={() => {
                        setSelectedRepoUrl(repo.clone_url);
                        setIsRepoDialogOpen(false);
                      }}
                    >
                      <div className="flex-1">
                        <div className="font-medium">{repo.name}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {repo.clone_url}
                        </div>
                      </div>
                      {selectedRepoUrl === repo.clone_url && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    No repositories found
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <DialogFooter>
        <Button 
          type="submit" 
          disabled={reposLoading || createLoading || !selectedRepoUrl || !projectName}
        >
          {createLoading ? 'Creating...' : 'Create Project'}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default CreateProjectForm;