import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '경기 하루이음 | 나만의 하루를 잇다',
  description:
    '경기도의 바다와 갯골을 만나는 여행. AI와 함께 계획하고 나만의 하루이음으로 기록하세요.',
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
