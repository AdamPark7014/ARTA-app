'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  api,
  AuthUser,
  EntityKey,
  clearToken,
  getActiveEntity,
  hasSessionHint,
  setActiveEntity,
} from '@/lib/api';
import { consumeHandoffParam } from '@/lib/cross-entity-handoff';
import { entityFromHost } from '@/lib/domains';
import { setEntityCookie, setSessionCookie } from '@/lib/session-cookie';

type LoginResult =
  | { requires2fa: true; challengeId: string }
  | { requiresTotpEnrollment: true; enrollToken: string }
  | { requires2fa?: false };

type TotpSetup = { secret: string; otpauth: string; qrDataUrl: string };

type Ctx = {
  user: AuthUser | null;
  loading: boolean;
  entity: EntityKey;
  setEntity: (e: EntityKey) => void;
  login: (email: string, password: string) => Promise<LoginResult>;
  verify2fa: (challengeId: string, code: string) => Promise<void>;
  setupEnrollmentTotp: (enrollToken: string) => Promise<TotpSetup>;
  completeEnrollment: (enrollToken: string, code: string) => Promise<void>;
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
    let cancelled = false;
    (async () => {
      clearToken();
      const handoff = await consumeHandoffParam();
      if (cancelled) return;
      if (handoff) {
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
      if (hasSessionHint()) {
        await refresh();
      } else {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyUser = (data: { user: AuthUser }) => {
    clearToken();
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

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const data = await api<{
      user?: AuthUser;
      requires2fa?: boolean;
      challengeId?: string;
      requiresTotpEnrollment?: boolean;
      enrollToken?: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (data.requires2fa && data.challengeId) {
      return { requires2fa: true, challengeId: data.challengeId };
    }

    if (data.requiresTotpEnrollment && data.enrollToken) {
      return { requiresTotpEnrollment: true, enrollToken: data.enrollToken };
    }

    if (!data.user) throw new Error('Login inválido');
    applyUser({ user: data.user });
    return { requires2fa: false };
  };

  const verify2fa = async (challengeId: string, code: string) => {
    const data = await api<{ user: AuthUser }>('/auth/2fa/verify-login', {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    });
    applyUser(data);
  };

  /** Org policy forces 2FA and this user has none yet: fetch the QR/secret to enroll. */
  const setupEnrollmentTotp = async (enrollToken: string): Promise<TotpSetup> => {
    return api<TotpSetup>('/auth/2fa/setup', {
      method: 'POST',
      body: JSON.stringify({ enrollToken }),
    });
  };

  /** Verifies the just-scanned code and — since no session existed until now — logs the user in. */
  const completeEnrollment = async (enrollToken: string, code: string) => {
    const data = await api<{ user: AuthUser }>('/auth/2fa/complete-enrollment', {
      method: 'POST',
      body: JSON.stringify({ enrollToken, code }),
    });
    applyUser(data);
  };

  const logout = () => {
    api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearToken();
    setSessionCookie(false);
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        entity,
        setEntity,
        login,
        verify2fa,
        setupEnrollmentTotp,
        completeEnrollment,
        logout,
        refresh,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser outside provider');
  return ctx;
}
