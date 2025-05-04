'use client';

import { useState, useEffect } from 'react';
import { useQuery, gql } from '@apollo/client';

const GET_REPOSITORIES = gql`
  query GetRepositories {
    repositories {
      name
      html_url
    }
  }
`;

interface RepoListProps {
  onRepoSelect: (repoUrl: string) => void;
  selectedRepoUrl: string; 
}

const RepoList = ({onRepoSelect , selectedRepoUrl} : RepoListProps) => {
  const { loading, error, data } = useQuery(GET_REPOSITORIES);
  const [repos, setRepos] = useState<any[]>([]);

  useEffect(() => {
    if (data?.repositories) {
      setRepos(data.repositories);
    }
  }, [data]);

  if (loading) return <p>Loading repositories...</p>;
  if (error) return <p>Error fetching repositories: {error.message}</p>;

  return (
    <div>
      <h2>Your Repositories</h2>
      <ul>
        {repos.map((repo) => (
          <li key={repo.html_url}>
            <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
              {repo.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RepoList;