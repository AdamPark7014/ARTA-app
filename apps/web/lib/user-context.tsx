'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  api,
  AuthUser,
  EntityKey,
  clearToken,
  getActiveEntity,
  getToken,
  setActiveEntity,
  setToken,
} from '@/lib/api';
import { consumeHandoffParam } from '@/lib/cross-entity-handoff';
import { entityFromHost } from '@/lib/domains';
import { setEntityCookie, setSessionCookie } from '@/lib/session-cookie';

type Ctx = {
  user: AuthUser | null;
  loading: boolean;
  entity: EntityKey;
  setEntity: (e: EntityKey) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const UserContext = createContext<Ctx | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [entity, setEntityState] = useState<EntityKey>('ARTA');

  const setEntity = (e: EntityKey) => {
    setActiveEntity(e);
    setEntityState(e);
    setEntityCookie(e);
  };

  const refresh = async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setSessionCookie(false);
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ user: AuthUser }>('/auth/me');
      setUser(data.user);
      setSessionCookie(true);

      const hostEntity =
        typeof window !== 'undefined' ? entityFromHost(window.location.hostname) : null;
      if (hostEntity && data.user.entities.includes(hostEntity)) {
        setEntity(hostEntity);
        return;
      }

      const saved = getActiveEntity();
      const preferred =
        data.user.roleKey === 'dir_auditorio' && data.user.entities.includes('EXPLANADA')
          ? 'EXPLANADA'
          : saved;
      if (data.user.entities.includes(preferred)) setEntity(preferred);
      else if (data.user.entities[0]) setEntity(data.user.entities[0] as EntityKey);
    } catch {
      clearToken();
      setSessionCookie(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handoff = consumeHandoffParam();
    if (handoff) {
      setToken(handoff.accessToken);
      setUser(handoff.user);
      setSessionCookie(true);
      const hostEntity = entityFromHost(window.location.hostname);
      const nextEntity =
        hostEntity && handoff.user.entities.includes(hostEntity)
          ? hostEntity
          : handoff.entity && handoff.user.entities.includes(handoff.entity)
            ? handoff.entity
            : handoff.user.entities[0] || 'ARTA';
      setEntity(nextEntity);
      setLoading(false);
      return;
    }

    setEntityState(getActiveEntity());
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.accessToken);
    setUser(data.user);
    setSessionCookie(true);

    const hostEntity = entityFromHost(window.location.hostname);
    if (hostEntity && data.user.entities.includes(hostEntity)) {
      setEntity(hostEntity);
      return;
    }

    const home =
      data.user.roleKey === 'dir_auditorio' && data.user.entities.includes('EXPLANADA')
        ? 'EXPLANADA'
        : data.user.entities.includes('ARTA')
          ? 'ARTA'
          : data.user.entities[0] || 'ARTA';
    setEntity(home);
  };

  const logout = () => {
    clearToken();
    setSessionCookie(false);
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <UserContext.Provider value={{ user, loading, entity, setEntity, login, logout, refresh }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser outside provider');
  return ctx;
}
