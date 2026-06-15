import { useEffect, useState } from 'react';

export interface BrandingInfo {
  companyName: string;
  brandName: string;
  logoSizeSidebar: number;
  logoSizeLogin: number;
  hasFavicon: boolean;
}

interface AppConfig {
  rentalUrl: string;
  warehouseUrl: string;
  plannerUrl: string;
  branding?: BrandingInfo;
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

export function useBranding() {
  const config = useAppConfig();
  return config?.branding || null;
}
