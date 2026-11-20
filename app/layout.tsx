import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '경기 하루이음 | 나만의 하루를 잇다',
  description:
    '경기도 31개 시·군의 관광지를 둘러보고, AI와 함께 나만의 하루 여행을 계획하고 기록해 보세요.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="has-bottom-navigation">{children}</body>
    </html>
  );
}
