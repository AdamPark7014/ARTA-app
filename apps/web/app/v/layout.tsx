import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Acceso proveedor',
};

export default function VendorPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
