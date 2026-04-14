import { createContext } from 'react';

export interface LoaderContextType {
  isLoading: boolean;
  setLoading: (state: boolean) => void;
}

const LoaderContext = createContext<LoaderContextType | undefined>(undefined);

export default LoaderContext;
