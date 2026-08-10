async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  photos: {
    list: (params?: { tag?: string; camera?: string; location?: string; untagged?: boolean; orphan?: boolean }) => {
      const qs = new URLSearchParams();
      if (params?.tag) qs.set('tag', params.tag);
      if (params?.camera) qs.set('camera', params.camera);
      if (params?.location) qs.set('location', params.location);
      if (params?.untagged) qs.set('untagged', 'true');
      if (params?.orphan) qs.set('orphan', 'true');
      const suffix = qs.toString() ? `?${qs}` : '';
      return request<{ photos: import('./types').Photo[] }>(`/api/photos${suffix}`);
    },
    get: (id: number) => request<{ photo: import('./types').Photo; ideas: { id: number; title: string; why: string | null }[] }>(`/api/photos/${id}`),
    upload: async (files: File[]) => {
      const form = new FormData();
      for (const f of files) form.append('photos', f);
      const res = await fetch('/api/photos/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<{ results: { photo: import('./types').Photo; wasDuplicate: boolean }[] }>;
    },
    update: (id: number, data: Partial<{ camera: string; lens: string; film_stock: string; location: string; photoshoot: string }>) =>
      request<{ photo: import('./types').Photo }>(`/api/photos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/photos/${id}`, { method: 'DELETE' }),
    shootOptions: () => request<import('./types').ShootOptions>('/api/photos/shoot-options'),
    addTag: (photoId: number, name: string, source?: 'user_confirmed' | 'user_added') =>
      request(`/api/photos/${photoId}/tags`, { method: 'POST', body: JSON.stringify({ name, source }) }),
    confirmTag: (photoId: number, tagId: number) =>
      request(`/api/photos/${photoId}/tags/${tagId}`, { method: 'PATCH', body: JSON.stringify({ source: 'user_confirmed' }) }),
    setTagNote: (photoId: number, tagId: number, note: string) =>
      request(`/api/photos/${photoId}/tags/${tagId}`, { method: 'PATCH', body: JSON.stringify({ note }) }),
    removeTag: (photoId: number, tagId: number) =>
      request<void>(`/api/photos/${photoId}/tags/${tagId}`, { method: 'DELETE' }),
  },
  tags: {
    list: () => request<{ tags: import('./types').Tag[] }>('/api/tags'),
  },
  ideas: {
    list: () => request<{ ideas: import('./types').Idea[] }>('/api/ideas'),
    get: (id: number) => request<{ idea: import('./types').Idea; photos: import('./types').IdeaPhoto[] }>(`/api/ideas/${id}`),
    create: (data: { title: string; notes?: string; light_pref?: string }) =>
      request<{ idea: import('./types').Idea }>('/api/ideas', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{ title: string; notes: string; light_pref: string; status: string }>) =>
      request<{ idea: import('./types').Idea }>(`/api/ideas/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/ideas/${id}`, { method: 'DELETE' }),
    addPhoto: (ideaId: number, photoId: number, why?: string) =>
      request(`/api/ideas/${ideaId}/photos`, { method: 'POST', body: JSON.stringify({ photoId, why }) }),
    setWhy: (ideaId: number, photoId: number, why: string) =>
      request(`/api/ideas/${ideaId}/photos/${photoId}`, { method: 'PATCH', body: JSON.stringify({ why }) }),
    removePhoto: (ideaId: number, photoId: number) =>
      request<void>(`/api/ideas/${ideaId}/photos/${photoId}`, { method: 'DELETE' }),
    suggestedPhotos: (ideaId: number) => request<{ photos: import('./types').Photo[] }>(`/api/ideas/${ideaId}/suggested-photos`),
    exportUrl: (ideaId: number) => `/api/ideas/${ideaId}/export`,
  },
  discovery: {
    gapFinder: () => request<{ gaps: { id: number; slug: string; name: string; unclaimed_count: number }[] }>('/api/gap-finder'),
    orphans: () => request<{ photos: import('./types').Photo[] }>('/api/orphans'),
    comboSuggestions: () => request<{ combos: import('./types').ComboSuggestion[] }>('/api/combo-suggestions'),
  },
  visionProviders: {
    list: () => request<{ providers: import('./types').VisionProviderProfile[] }>('/api/vision-providers'),
    create: (data: {
      name: string;
      type: import('./types').VisionProviderType;
      base_url?: string;
      api_key?: string;
      model?: string;
      enabled?: boolean;
    }) =>
      request<{ provider: import('./types').VisionProviderProfile }>('/api/vision-providers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: number,
      data: Partial<{
        name: string;
        type: import('./types').VisionProviderType;
        base_url: string;
        api_key: string;
        model: string;
        enabled: boolean;
      }>
    ) =>
      request<{ provider: import('./types').VisionProviderProfile }>(`/api/vision-providers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: number) => request<void>(`/api/vision-providers/${id}`, { method: 'DELETE' }),
  },
};
