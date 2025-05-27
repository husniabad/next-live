'use client'; // This file uses client-side features like React Context and localStorage

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation'; // For redirection after logout

// Define the shape of the authentication context
interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean; // To indicate if the initial auth check is in progress
  user: { id: number; username: string } | null; // Basic user info if needed (can be expanded)
  login: (newToken: string) => void; // Function to set the token after successful login
  logout: () => void; // Function to remove the token and log out
}

// Create the Auth Context with default values
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider component to wrap the application and provide the context
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: number; username: string } | null>(null); // Placeholder for user info
  const [isLoading, setIsLoading] = useState(true); // Start as loading while checking local storage
  const router = useRouter(); // Get router instance

  // Effect to check for token in local storage on initial load
  useEffect(() => {
    console.log("AuthProvider: Checking for token in local storage...");
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      // TODO: Optionally verify the token with your backend or decode it here
      // For simplicity now, we just assume a stored token means authenticated
      setToken(storedToken);
      // TODO: Fetch or decode user info from the token if needed
      // setUser({ id: 1, username: 'Authenticated User' }); // Placeholder user
      console.log("AuthProvider: Token found.");
    } else {
      console.log("AuthProvider: No token found.");
    }
    setIsLoading(false); // Authentication check is complete
  }, []); // Empty dependency array ensures this runs only once on mount

  // Function to handle login (called after successful mutation)
  const login = (newToken: string) => {
    console.log("AuthProvider: Logging in, storing token...");
    localStorage.setItem('token', newToken);
    setToken(newToken);
    // TODO: Decode user info from newToken and set setUser state
    // setUser({ id: 1, username: 'New User' }); // Placeholder user
    // Optionally redirect to dashboard here if not handled by the mutation callback
    // router.push('/dashboard');
  };

  // Function to handle logout
  const logout = () => {
    console.log("AuthProvider: Logging out, removing token...");
    localStorage.removeItem('token'); // Remove token from local storage
    setToken(null); // Clear token state
    setUser(null); // Clear user state
    // Redirect to the home page after logout
    router.push('/login'); // Redirect to login page or home page
  };

  // Determine isAuthenticated status based on token presence
  const isAuthenticated = !!token;

  // Provide the context value to the children
  return (
    <AuthContext.Provider value={{ token, isAuthenticated, isLoading, user, login, logout }}>{children}</AuthContext.Provider>
  );
};

// Custom hook to easily access the authentication context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
