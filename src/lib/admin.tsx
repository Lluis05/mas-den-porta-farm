import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * PIN compartit, no comptes individuals (com es va decidir pel login de
 * treballador). Viu només en memòria: en tancar l'app cal tornar-lo a
 * escriure, com un bloqueig de pantalla. Prou per aquest cas — no hi ha
 * dades sensibles darrere, només vistes de la granja.
 */
const PIN_ADMIN = '4163';

type AdminContextValue = {
  isAdmin: boolean;
  desbloqueja: (pin: string) => boolean;
  bloqueja: () => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  const value: AdminContextValue = {
    isAdmin,
    desbloqueja: (pin) => {
      const ok = pin === PIN_ADMIN;
      if (ok) setIsAdmin(true);
      return ok;
    },
    bloqueja: () => setIsAdmin(false),
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin() ha d’anar dins de <AdminProvider>');
  return ctx;
}
