import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Initiatives',
  description: 'Collect initiatives',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
