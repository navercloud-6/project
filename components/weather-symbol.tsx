import type { ReactNode } from 'react';
import type { WeatherIcon } from '@/lib/domain/weather';

export const weatherIconLabels: Record<WeatherIcon, string> = {
  sun: '맑음',
  'cloud-sun': '구름 조금',
  cloud: '흐림',
  rain: '비',
  snow: '눈',
  wind: '바람',
};

const weatherSymbols: Record<WeatherIcon, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
    </>
  ),
  'cloud-sun': (
    <>
      <path d="M12 2v2M5.6 5.6l1.4 1.4M2 12h2M18.4 5.6 17 7" />
      <path d="M9 15.5a3.5 3.5 0 1 1 3.2-4.9A4.5 4.5 0 1 1 17.5 19H9a3.5 3.5 0 0 1 0-7" />
    </>
  ),
  cloud: (
    <path d="M7.5 18a4.5 4.5 0 0 1-.9-8.9A6 6 0 0 1 18 10a4 4 0 0 1 .5 8h-11Z" />
  ),
  rain: (
    <>
      <path d="M7 15a4 4 0 0 1-.8-7.9A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7H7Z" />
      <path d="m9 18-1.5 3m5-3-1.5 3m5-3-1.5 3" />
    </>
  ),
  snow: (
    <>
      <path d="M7 15a4 4 0 0 1-.8-7.9A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7H7Z" />
      <path d="M8.5 18.5h.01M12 19.5h.01M15.5 18.5h.01" strokeWidth="2.6" />
    </>
  ),
  wind: (
    <path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5M3 12h15a2.5 2.5 0 1 1-2.5 2.5M3 16h7a2.5 2.5 0 1 1-2.5 2.5" />
  ),
};

export function WeatherSymbol({
  icon,
  size = 28,
  className,
}: {
  icon: WeatherIcon;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {weatherSymbols[icon]}
    </svg>
  );
}
