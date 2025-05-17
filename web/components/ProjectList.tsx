// web/components/ProjectList.tsx
'use client'; // This is a client component

import { useQuery, gql } from '@apollo/client';
import ProjectItem from './ProjectItem'; // Import the Project Item component
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Assuming shadcn card

// GraphQL Query to fetch the list of projects for the logged-in user
const GET_PROJECTS = gql`
  query GetProjects {
    projects { # Assuming your 'projects' query returns a list of Project objects
      id
      name
      gitRepoUrl
      createdAt
      deployments{
        id
        status
        deploymentUrl
        createdAt
      }
      # # Include the latest deployment status if available in your schema
      # latestDeployment { # Assuming a relationship field like 'latestDeployment' on Project
      #   id
      #   status # e.g., 'pending', 'deploying', 'success', 'failed'
      #   createdAt
      #   deploymentUrl # Include URL if needed for quick access
      # }
    }
  }
`;

const ProjectList = () => {
  // Fetch the list of projects using the GET_PROJECTS query
  const { data, loading, error, refetch } = useQuery(GET_PROJECTS);

  // Show loading state
  if (loading) {
    return <p>Loading projects...</p>; // Or a loading spinner
  }

  // Show error state
  if (error) {
    console.error("Error fetching projects:", error);
    return <p className="text-red-500">Error loading projects: {error.message}</p>;
  }

  // If data is loaded and there are no projects
  if (!data?.projects || data.projects.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>No Projects Yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Get started by creating your first project!</p>
          {/* Optionally include a Create Project Button here too */}
        </CardContent>
      </Card>
    );
  }

  // If projects are loaded, render the list
  const projects = data.projects;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"> {/* Responsive grid layout */}
      {
      //@ts-ignore
      projects.map((project: any) => ( // Map over the projects data
        // Render a ProjectItem component for each project
        // Pass project data and the refetch function (useful if an action on an item should refresh the list)
        <ProjectItem key={project.id} project={project} onProjectUpdated={refetch} />
      ))}
    </div>
  );
};

export default ProjectList;
