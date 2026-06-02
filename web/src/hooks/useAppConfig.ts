import { useEffect, useState } from 'react';

interface AppConfig {
  rentalUrl: string;
  warehouseUrl: string;
  plannerUrl: string;
}

let cached: AppConfig | null = null;

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(cached);

  useEffect(() => {
    if (cached) return;
    fetch('/api/v1/config')
      .then(r => r.json())
      .then((data: AppConfig) => {
        cached = data;
        setConfig(data);
      })
      .catch(() => {});
  }, []);

  return config;
}
