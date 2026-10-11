'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from './api';

// Whether Gemini is set up on the server (GEMINI_API_KEY). Asked once per page load.
let cached: Promise<boolean> | null = null;

export function useAiEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!cached) {
      cached = apiRequest('/ai/status')
        .then((res: any) => !!res?.enabled)
        .catch(() => {
          cached = null; // retry on the next mount
          return false;
        });
    }
    let active = true;
    cached.then((value) => { if (active) setEnabled(value); });
    return () => { active = false; };
  }, []);

  return enabled;
}
