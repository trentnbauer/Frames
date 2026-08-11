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
    list: (params?: {
      tag?: string;
      tag2?: string;
      camera?: string;
      location?: string;
      season?: string;
      film_stock?: string;
      q?: string;
      trashed?: boolean;
      favorite?: boolean;
      sort?: 'created_at' | 'taken_at';
      limit?: number;
      offset?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.tag) qs.set('tag', params.tag);
      if (params?.tag2) qs.set('tag2', params.tag2);
      if (params?.camera) qs.set('camera', params.camera);
      if (params?.location) qs.set('location', params.location);
      if (params?.season) qs.set('season', params.season);
      if (params?.film_stock) qs.set('film_stock', params.film_stock);
      if (params?.q) qs.set('q', params.q);
      if (params?.trashed) qs.set('trashed', 'true');
      if (params?.favorite) qs.set('favorite', 'true');
      if (params?.sort) qs.set('sort', params.sort);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.offset) qs.set('offset', String(params.offset));
      const suffix = qs.toString() ? `?${qs}` : '';
      return request<{ photos: import('./types').Photo[]; total: number }>(`/api/photos${suffix}`);
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
    restore: (id: number) => request<{ photo: import('./types').Photo }>(`/api/photos/${id}/restore`, { method: 'POST' }),
    deletePermanently: (id: number) => request<void>(`/api/photos/${id}/permanent`, { method: 'DELETE' }),
    retag: (id: number) => request<{ ok: boolean }>(`/api/photos/${id}/retag`, { method: 'POST' }),
    favorite: (id: number) => request<{ photo: import('./types').Photo }>(`/api/photos/${id}/favorite`, { method: 'POST' }),
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
    rename: (id: number, name: string) =>
      request<{ tag: import('./types').Tag }>(`/api/tags/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    merge: (fromId: number, intoId: number) =>
      request<{ tag: import('./types').Tag }>('/api/tags/merge', { method: 'POST', body: JSON.stringify({ fromId, intoId }) }),
    remove: (id: number) => request<void>(`/api/tags/${id}`, { method: 'DELETE' }),
  },
  ideas: {
    list: () => request<{ ideas: import('./types').Idea[] }>('/api/ideas'),
    get: (id: number) => request<{ idea: import('./types').Idea; photos: import('./types').IdeaPhoto[] }>(`/api/ideas/${id}`),
    create: (data: { title: string; notes?: string; light_pref?: string }) =>
      request<{ idea: import('./types').Idea }>('/api/ideas', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<{ title: string; notes: string; light_pref: string; status: string; zine_state: string | null }>) =>
      request<{ idea: import('./types').Idea }>(`/api/ideas/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/ideas/${id}`, { method: 'DELETE' }),
    addPhoto: (ideaId: number, photoId: number, why?: string) =>
      request(`/api/ideas/${ideaId}/photos`, { method: 'POST', body: JSON.stringify({ photoId, why }) }),
    setWhy: (ideaId: number, photoId: number, why: string) =>
      request(`/api/ideas/${ideaId}/photos/${photoId}`, { method: 'PATCH', body: JSON.stringify({ why }) }),
    removePhoto: (ideaId: number, photoId: number) =>
      request<void>(`/api/ideas/${ideaId}/photos/${photoId}`, { method: 'DELETE' }),
    reorder: (ideaId: number, photoIds: number[]) =>
      request(`/api/ideas/${ideaId}/reorder`, { method: 'PATCH', body: JSON.stringify({ photoIds }) }),
    suggestedPhotos: (ideaId: number) => request<{ photos: import('./types').Photo[] }>(`/api/ideas/${ideaId}/suggested-photos`),
    exportUrl: (ideaId: number) => `/api/ideas/${ideaId}/export`,
    briefUrl: (ideaId: number) => `/api/ideas/${ideaId}/brief`,
  },
  discovery: {
    comboSuggestions: () => request<{ combos: import('./types').ComboSuggestion[] }>('/api/combo-suggestions'),
    nearDuplicates: () => request<{ groups: import('./types').NearDuplicateGroup[][] }>('/api/near-duplicates'),
  },
  config: {
    get: () =>
      request<{
        googleDrive: { apiKey: string; clientId: string } | null;
        dropbox: { appKey: string } | null;
        socialHandles: string[] | null;
        watchFolder: string | null;
      }>('/api/config'),
  },
  weather: {
    today: (location: string) =>
      request<{
        place: { name: string; country: string | null };
        weather: { temperatureC: number; cloudCoverPct: number; precipitationMm: number; isDay: boolean };
        lightConditions: string;
        ideas: import('./types').Idea[];
      }>(`/api/weather/today?location=${encodeURIComponent(location)}`),
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
