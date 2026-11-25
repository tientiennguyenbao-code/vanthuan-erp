import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vạn Thuận ERP',
  description: 'Phần mềm quản trị vận hành – Công ty TNHH Vạn Thuận Global',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
