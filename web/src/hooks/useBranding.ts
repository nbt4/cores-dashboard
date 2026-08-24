import { useEffect, useState } from 'react';

export interface BrandingAssets {
  markOnDark: string;
  markOnLight: string;
  horizontalOnDark: string;
  horizontalOnLight: string;
  stackedOnDark: string;
  stackedOnLight: string;
  favicon: string;
  appIcon: string;
  maskableIcon: string;
  print: string;
}

export interface BrandingConfig {
  productName: string;
  companyName: string;
  brandName: string;
  assets: BrandingAssets;
  companyAssets: BrandingAssets;
  sidebarLogo: string;
  loginLogo: string;
  faviconPath: string;
}

const defaults: BrandingConfig = {
  productName: 'Cores', companyName: 'Cores', brandName: '',
  assets: {
    markOnDark: '/logos/cores_white_icon.svg', markOnLight: '/logos/cores_black_icon.svg',
    horizontalOnDark: '/logos/cores_white_side.svg', horizontalOnLight: '/logos/cores_black_side.svg',
    stackedOnDark: '/logos/cores_white_full.svg', stackedOnLight: '/logos/cores_black_full.svg',
    favicon: '/logos/cores_black_icon.svg', appIcon: '/app-icons/icon-512.png',
    maskableIcon: '/app-icons/icon-maskable-512.png', print: '/logos/cores_black_side.svg',
  },
  companyAssets: {} as BrandingAssets,
  sidebarLogo: '/logos/cores_white_side.svg', loginLogo: '/logos/cores_white_full.svg',
  faviconPath: '/logos/cores_black_icon.svg',
};

let cached = defaults;
let started = false;
const listeners = new Set<(branding: BrandingConfig) => void>();

function mergeAssets(raw: Partial<BrandingAssets> | undefined, fallback: BrandingAssets): BrandingAssets {
  return { ...fallback, ...(raw || {}) };
}

function applyDocumentBranding(branding: BrandingConfig) {
  const setLink = (selector: string, rel: string, href: string) => {
    if (!href) return;
    let link = document.querySelector<HTMLLinkElement>(selector);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
    if (rel === 'icon') link.type = href.toLowerCase().includes('.png') ? 'image/png' : 'image/svg+xml';
  };
  setLink("link[rel~='icon']", 'icon', branding.assets.favicon || branding.faviconPath);
  setLink("link[rel='apple-touch-icon']", 'apple-touch-icon', branding.assets.appIcon);
  document.documentElement.dataset.product = branding.productName;
}

async function refresh() {
  try {
    const response = await fetch('/api/v1/branding', { cache: 'no-store' });
    if (!response.ok) return;
    const raw = await response.json();
    const assets = mergeAssets(raw.assets, defaults.assets);
    cached = {
      productName: raw.productName || defaults.productName,
      companyName: raw.companyName || defaults.companyName,
      brandName: raw.brandName || '',
      assets,
      companyAssets: mergeAssets(raw.companyAssets, {} as BrandingAssets),
      sidebarLogo: assets.horizontalOnDark,
      loginLogo: assets.stackedOnDark || assets.horizontalOnDark,
      faviconPath: assets.favicon,
    };
    applyDocumentBranding(cached);
    listeners.forEach(listener => listener(cached));
  } catch { /* retain bundled branding while offline */ }
}

function startBrandingUpdates() {
  if (started) return;
  started = true;
  void refresh();
  window.setInterval(() => void refresh(), 60_000);
}

export function useBranding() {
  const [branding, setBranding] = useState(cached);
  useEffect(() => {
    listeners.add(setBranding);
    startBrandingUpdates();
    return () => { listeners.delete(setBranding); };
  }, []);
  return branding;
}
