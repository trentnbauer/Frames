import type { ReactNode } from 'react';
import type { Me } from '../store';
import type { Section } from './ui';
import { useAccountProfile, useAccountSecurity, useAccountNotifications, useAppSettingsPage, useReviewSchedule, useReviewCommunity, useReviewCleanup, usePhotoTags, usePhotoXmp, usePhotoAi, usePortfolioPage, useStorageTab, useDataTab } from './lib3';
import { useSignin, useMembers, useFolders, useBackup, useSrvAi, useNetwork, useEmail, useProcessing, useServer, usePolicies } from './srv';

export type Ctx = { toast: (m: string) => void; modal: (n: ReactNode) => void; goto: (tab: 'lib' | 'srv', key: string, sub?: string) => void; me: Me | null; isAdmin: boolean };
/** One page of a section that opens with the segmented tabs. Only the tab on show runs its hook. */
export type TabDef = { key: string; label: string; use: (ctx: Ctx) => Section };
/** A settings section: one page (`use`), or several tabs. `sub` is the faint line under its name in the sidebar. */
export type SectionDef = { tab: 'lib' | 'srv'; key: string; name: string; sub?: string; badge?: string; use?: (ctx: Ctx) => Section; tabs?: TabDef[] };

export const LIB: SectionDef[] = [
  { tab: 'lib', key: 'account', name: 'Account', sub: 'Profile · Security · Notifications', tabs: [
    { key: 'profile', label: 'Profile', use: useAccountProfile },
    { key: 'security', label: 'Security', use: useAccountSecurity },
    { key: 'notifications', label: 'Notifications', use: useAccountNotifications },
  ] },
  { tab: 'lib', key: 'app', name: 'App settings', sub: 'Display · Reviewing · Home · To do', use: useAppSettingsPage },
  { tab: 'lib', key: 'reviews', name: 'Reviews', sub: 'Schedule · Community · Clean-up', tabs: [
    { key: 'schedule', label: 'Schedule', use: useReviewSchedule },
    { key: 'community', label: 'Community', use: useReviewCommunity },
    { key: 'clean-up', label: 'Clean-up', use: useReviewCleanup },
  ] },
  { tab: 'lib', key: 'photo', name: 'Photo details', sub: 'Tags · Camera & XMP · AI', tabs: [
    { key: 'tags', label: 'Tags', use: usePhotoTags },
    { key: 'camera-xmp', label: 'Camera & XMP', use: usePhotoXmp },
    { key: 'ai', label: 'AI', use: usePhotoAi },
  ] },
  { tab: 'lib', key: 'portfolio', name: 'Portfolio', sub: 'Publishing · What’s shown · The site', use: usePortfolioPage },
  { tab: 'lib', key: 'storage', name: 'Storage & data', sub: 'Storage · Your data', tabs: [
    { key: 'storage', label: 'Storage', use: useStorageTab },
    { key: 'your-data', label: 'Your data', use: useDataTab },
  ] },
];
export const SRV: SectionDef[] = [
  { tab: 'srv', key: 'signin', name: 'Sign-in & access', use: useSignin },
  { tab: 'srv', key: 'people', name: 'Members', use: useMembers },
  { tab: 'srv', key: 'folders', name: 'Storage', use: useFolders },
  { tab: 'srv', key: 'backup', name: 'Backup', use: useBackup },
  { tab: 'srv', key: 'srvai', name: 'AI', use: useSrvAi },
  { tab: 'srv', key: 'network', name: 'Cloudflare tunnel', use: useNetwork },
  { tab: 'srv', key: 'email', name: 'Email', use: useEmail },
  { tab: 'srv', key: 'policies', name: 'Policies', use: usePolicies },
  { tab: 'srv', key: 'processing', name: 'Cache & processing', use: useProcessing },
  { tab: 'srv', key: 'server', name: 'Updates & system', use: useServer },
];
