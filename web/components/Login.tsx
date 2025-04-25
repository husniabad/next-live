'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import axios from 'axios';
import { Button } from './ui/button';
import RepoList from './RepoList';

const LOGIN_GIT = gql`
  mutation LoginGit($provider: String!, $code: String!) {
    loginGit(provider: $provider, code: $code) {
      token
    }
  }
`;

const Login = () => {
  const router = useRouter();
  const [loginGitMutation] = useMutation(LOGIN_GIT);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);


  const handleGitHubLogin = async () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      setError('GitHub client ID or redirect URI not configured.');
      return;
    }

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo`;
    window.location.href = authUrl;
  };

  const handleCallback = async () => {
    const urlParams = new URLSearchParams(window?.location.search);
    const code = urlParams.get('code');

    if (code) {
      try {
        const { data } = await loginGitMutation({
          variables: { provider: 'github', code },
        });
        localStorage.setItem('token', data.loginGit.token);
        setIsLoggingIn(false)
        // router.push('/');
      } catch (err) {
        setError('Login failed. Please try again.');
        console.error(err);
      }
    }
  };



  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
      setIsLoggingIn(true);
      handleCallback();
    }
  }, []);

  if (isLoggingIn) {
    return <p>Logging in...</p>;
  }

  return (
    <div className='flex flex-col gap-4'>
      <Button onClick={handleGitHubLogin}>Login with GitHub</Button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <RepoList/>
    </div>
  );
};

export default Login;