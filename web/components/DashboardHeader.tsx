// web/components/DashboardHeader.tsx
'use client'; // This is a client component

import { useQuery, gql } from '@apollo/client';
import { useAuth } from '@/lib/auth'; // Import auth hook to get user info
import { Button } from '@/components/ui/button'; // Assuming shadcn button
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'; // Assuming shadcn avatar
import CreateProjectButton from './CreateProjectButton'; // Import the Create Project Button
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

// GraphQL Query to fetch the logged-in user's data
// We need the username and potentially other details like a profile picture URL
const GET_ME = gql`
  query Me {
    me {
      id
      username
      gitAccounts {
        id
        name
        profileUrl
        provider
        avatarUrl
      }
    }
  }
`;

const DashboardHeader = () => {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth(); // Get user info and auth state
  // Fetch user data using the GET_ME query
  // Skip the query if auth is loading or user is not authenticated
  const {
    data,
    loading: queryLoading,
    error,
  } = useQuery(GET_ME, {
    skip: authLoading || !isAuthenticated,
    // Optional: fetchPolicy: 'cache-and-network' or 'network-only' depending on caching strategy
  });

  // Determine the user's username to display
  // Prioritize data from the query if available, otherwise use user from auth context (if populated)
  const name =
    data?.me?.gitAccounts[0]?.name ||
    data?.me?.username ||
    user?.username ||
    'Loading...';
  const gitHubUrl = data?.me?.gitAccounts[0]?.profileUrl;
  // Placeholder for avatar URL - replace with actual data if available in GET_ME query
  const userAvatarUrl = data?.me?.gitAccounts[0]?.avatarUrl; // Assuming avatarUrl field exists in your 'me' query result

  console.log('User data from GET_ME query:', data); // Debugging log to check fetched user data
  // Show loading or error state for the header if data is not ready

  const handleLogout = () => {
    console.log('[DashboardHeader] Logging out...');
    logout(); // Call the logout function from the auth hook
    // The auth hook should handle clearing the token and redirecting
  };

  // Handle visiting GitHub account
  const handleVisitGitHub = () => {
    if (gitHubUrl) {
      console.log('[DashboardHeader] Visiting GitHub:', gitHubUrl);
      window.open(gitHubUrl, '_blank'); // Open in a new tab
    } else {
      console.warn('[DashboardHeader] GitHub URL not available.');
    }
  };

  if (authLoading || queryLoading) {
    return (
      <header className='bg-gray-800 dark:bg-gray-950 text-white p-4 shadow-md'>
        <div className='container mx-auto flex justify-between items-center'>
          <div className='flex items-center gap-4'>
            {/* Placeholder Avatar */}
            <DropdownMenu>
                           {' '}
              <DropdownMenuTrigger asChild>
                <Avatar>
                  <AvatarFallback>NN</AvatarFallback> {/* NN for No Name */}
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent className='w-56'>
                               {' '}
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                <DropdownMenuSeparator />               {' '}
                {/* Visit GitHub Account option - disabled if URL is not available */}
                               {' '}
                <DropdownMenuItem
                  onClick={handleVisitGitHub}
                  disabled={!gitHubUrl}
                  className={!gitHubUrl ? 'opacity-50 cursor-not-allowed' : '!cursor-pointer'}>
                                    Visit GitHub Account                {' '}
                </DropdownMenuItem>
                                {/* Add other potential options here */}       
                        {/* <DropdownMenuItem>Settings</DropdownMenuItem> */}
                                <DropdownMenuSeparator />               {' '}
                {/* Logout option */}               {' '}
                <DropdownMenuItem className='cursor-pointer' onClick={handleLogout}>
                                    Logout                {' '}
                </DropdownMenuItem>
                             {' '}
              </DropdownMenuContent>
            </DropdownMenu>

            <div>
              <p className='text-sm text-gray-400'>Logged in as</p>
              <h1 className='text-xl font-semibold'>Loading...</h1>
            </div>
          </div>
          {/* Placeholder button */}
          <Button disabled>Create New Project</Button>
        </div>
      </header>
    );
  }

  if (error) {
    console.error('Error fetching user data for dashboard header:', error);
    // Display header with error indication
    return (
      <header className='bg-red-800 text-white p-4 shadow-md'>
        <div className='container mx-auto flex justify-between items-center'>
          <div className='flex items-center gap-4'>
            {/* Error Avatar */}
            <DropdownMenu>
                           {' '}
              <DropdownMenuTrigger asChild>
                <Avatar>
                  <AvatarFallback>!!</AvatarFallback> {/* Error Indicator */}
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent className='w-56'>
                               {' '}
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                <DropdownMenuSeparator />               {' '}
                {/* Visit GitHub Account option - disabled if URL is not available */}
                               {' '}
                <DropdownMenuItem
                  onClick={handleVisitGitHub}
                  disabled={!gitHubUrl}
                  className={!gitHubUrl ? 'opacity-50 cursor-not-allowed' : ''}>
                                    Visit GitHub Account                {' '}
                </DropdownMenuItem>
                                {/* Add other potential options here */}       
                        {/* <DropdownMenuItem>Settings</DropdownMenuItem> */}
                                <DropdownMenuSeparator />               {' '}
                {/* Logout option */}               {' '}
                <DropdownMenuItem onClick={handleLogout}>
                                    Logout                {' '}
                </DropdownMenuItem>
                             {' '}
              </DropdownMenuContent>
            </DropdownMenu>

            <div>
              <p className='text-sm text-red-200'>User data error</p>
              <h1 className='text-xl font-semibold'>Error loading user</h1>
            </div>
          </div>
          {/* Button remains functional or disabled based on overall app state */}
          <CreateProjectButton />
        </div>
      </header>
    );
  }

  // If authenticated and data is loaded, render the header
  if (isAuthenticated && data?.me) {
    return (
      <header className='bg-gray-800 dark:bg-gray-950 text-white p-4 shadow-md'>
        <div className='container mx-auto flex justify-between items-center'>
          <div className='flex items-center gap-4'>
            {/* User Avatar */}
            <DropdownMenu>
                           {' '}
              <DropdownMenuTrigger asChild>
                <Avatar>
                  {/* Conditionally render AvatarImage if userAvatarUrl exists */}
                  {userAvatarUrl ? (
                    <AvatarImage
                      src={userAvatarUrl}
                      alt={`${name}'s avatar`}
                    />
                  ) : (
                    // Fallback with initials or a default icon
                    <AvatarFallback>
                      {name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent className='w-56'>
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* Visit GitHub Account option - disabled if URL is not available */}
                <DropdownMenuItem
                  onClick={handleVisitGitHub}
                  disabled={!gitHubUrl}
                  className={!gitHubUrl ? 'opacity-50 cursor-not-allowed' : ''}>
                  Visit GitHub Account
                </DropdownMenuItem>
                {/* Add other potential options here */}
                {/* <DropdownMenuItem>Settings</DropdownMenuItem> */}
                <DropdownMenuSeparator />
                {/* Logout option */}
                <DropdownMenuItem onClick={handleLogout}>
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div>
              <p className='text-sm text-gray-400'>Logged in as</p>
              <h1 className='text-xl font-semibold'>{name}</h1>
            </div>
          </div>
          {/* Create New Project Button */}
          <CreateProjectButton />
        </div>
      </header>
    );
  }

  // If not authenticated, this header should not be rendered due to page-level redirect,
  // but returning null or a fallback is safe.
  return null;
};

export default DashboardHeader;
