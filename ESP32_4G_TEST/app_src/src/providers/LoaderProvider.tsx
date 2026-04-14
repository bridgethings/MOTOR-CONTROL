import { ReactNode, useState } from 'react';
import LoaderContext from '@/contexts/LoaderContext';

const LoaderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLoading, setIsloading] = useState<boolean>(false);

  const setLoading = (state: boolean) => setIsloading(state);

  return (
    <LoaderContext.Provider value={{ isLoading, setLoading }}>{children}</LoaderContext.Provider>
  );
};

export default LoaderProvider;
