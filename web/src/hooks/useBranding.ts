import { useState, useEffect } from 'react';

export interface BrandingConfig {
  companyName: string;
  brandName: string;
  sidebarLogo: string;
  loginLogo: string;
  faviconPath: string;
  logoSizeSidebar: number;
  logoSizeLogin: number;
}

function readInitial(): BrandingConfig {
  return {
    companyName: 'Cores',
    brandName: '',
    sidebarLogo: '/logos/cores_white_side.svg',
    loginLogo: '/logos/cores_white_side.svg',
    faviconPath: '',
    logoSizeSidebar: 100,
    logoSizeLogin: 100,
  };
}

let cached = readInitial();

export function useBranding() {
  const [branding, setBranding] = useState<BrandingConfig>(cached);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch('/api/v1/branding');
        if (!res.ok || !active) return;
        const raw = await res.json();
        const data: BrandingConfig = {
          companyName: raw.companyName || readInitial().companyName,
          brandName: raw.brandName || '',
          sidebarLogo: raw.sidebarLogo || '/logos/cores_white_side.svg',
          loginLogo: raw.loginLogo || '/logos/cores_white_side.svg',
          faviconPath: raw.faviconPath || '',
          logoSizeSidebar: raw.logoSizeSidebar || 100,
          logoSizeLogin: raw.logoSizeLogin || 100,
        };
        cached = data;
        if (active) setBranding(data);
      } catch { /* network error */ }
    };

    const interval = setInterval(poll, 2000);
    // Also poll immediately
    poll();
    return () => { active = false; clearInterval(interval); };
  }, []);

  return branding;
}
