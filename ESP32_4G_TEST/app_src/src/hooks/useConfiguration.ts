import { useContext } from 'react';
import ConfigurationContext from '@/contexts/ConfigurationContext';

const useConfiguration = () => {
  const context = useContext(ConfigurationContext);
  if (!context) {
    throw new Error('useConfiguration must be used within a ConfigurationProvider');
  }
  return context;
};

export default useConfiguration;
