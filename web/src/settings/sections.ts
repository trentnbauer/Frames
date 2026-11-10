import type { ReactNode } from 'react';
import type { Me } from '../store';
import type { Section } from './ui';
import { useProfile, useNotifications, useReviews, useTags, useXmp, useAi, useCloud, usePortfolio, useData } from './lib';
import { useSignin, useMembers, useFolders, useBackup, useSrvAi, useNetwork, useEmail, useProcessing, useServer, usePolicies } from './srv';

export type Ctx = { toast: (m: string) => void; modal: (n: ReactNode) => void; goto: (tab: 'lib' | 'srv', key: string) => void; me: Me | null; isAdmin: boolean };
export type SectionDef = { tab: 'lib' | 'srv'; key: string; name: string; badge?: string; use: (ctx: Ctx) => Section };

export const LIB: SectionDef[] = [
  { tab: 'lib', key: 'profile', name: 'Profile', use: useProfile },
  { tab: 'lib', key: 'notifications', name: 'Notifications', use: useNotifications },
  { tab: 'lib', key: 'reviews', name: 'Reviews', use: useReviews },
  { tab: 'lib', key: 'tags', name: 'Tags & subjects', use: useTags },
  { tab: 'lib', key: 'xmp', name: 'Camera & XMP', use: useXmp },
  { tab: 'lib', key: 'ai', name: 'AI', use: useAi },
  { tab: 'lib', key: 'cloud', name: 'Cloud folders', use: useCloud },
  { tab: 'lib', key: 'portfolio', name: 'Portfolio', use: usePortfolio },
  { tab: 'lib', key: 'data', name: 'Your data', use: useData },
];
export const SRV: SectionDef[] = [
  { tab: 'srv', key: 'signin', name: 'Sign-in & access', use: useSignin },
  { tab: 'srv', key: 'people', name: 'Members', use: useMembers },
  { tab: 'srv', key: 'folders', name: 'Photos & storage', use: useFolders },
  { tab: 'srv', key: 'backup', name: 'Backup', use: useBackup },
  { tab: 'srv', key: 'srvai', name: 'AI', use: useSrvAi },
  { tab: 'srv', key: 'network', name: 'Cloudflare tunnel', use: useNetwork },
  { tab: 'srv', key: 'email', name: 'Email', use: useEmail },
  { tab: 'srv', key: 'policies', name: 'Policies', use: usePolicies },
  { tab: 'srv', key: 'processing', name: 'Storage & processing', use: useProcessing },
  { tab: 'srv', key: 'server', name: 'Updates & system', use: useServer },
];
