const items = [
  {
    id: 'explore',
    label: '경기 둘러보기',
    shortLabel: '둘러보기',
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
  },
  {
    id: 'journeys',
    label: '내 여행',
    shortLabel: null,
    icon: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="M8 2v4m8-4v4M8 11h8m-8 4h5" />
      </>
    ),
  },
  {
    id: 'assistant',
    label: '여행 도우미',
    shortLabel: '도우미',
    icon: (
      <>
        <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
        <path d="M19 15v4m-2-2h4M5 17v2m-1-1h2" />
      </>
    ),
  },
  {
    id: 'weather',
    label: '경기 날씨',
    shortLabel: '날씨',
    icon: (
      <>
        <path d="M12 2v2M5.6 5.6l1.4 1.4M2 12h2M18.4 5.6 17 7" />
        <path d="M9 15.5a3.5 3.5 0 1 1 3.2-4.9A4.5 4.5 0 1 1 17.5 19H9a3.5 3.5 0 0 1 0-7" />
      </>
    ),
  },
  {
    id: 'profile',
    label: '마이',
    shortLabel: null,
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
  },
] as const;
export type Tab = (typeof items)[number]['id'];

export function BottomNavigation({
  tab,
  savedCount,
  onTab,
}: {
  tab: Tab;
  savedCount: number;
  onTab: (tab: Tab) => void;
}) {
  return (
    <nav className="bottom-navigation" aria-label="주 메뉴">
      <div className="bottom-navigation-inner">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => onTab(item.id)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {item.icon}
            </svg>
            <span className="navigation-label-full">
              {item.label}
              {item.id === 'journeys' && (
                <>
                  {' '}
                  <span className="count">{savedCount}</span>
                </>
              )}
            </span>
            {item.shortLabel && (
              <span className="navigation-label-short">{item.shortLabel}</span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
