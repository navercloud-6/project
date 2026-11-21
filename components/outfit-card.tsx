import { useId } from 'react';
import type { Outfit } from '@/lib/domain/outfit';

/** 오늘의 옷차림 카드(경기 날씨 탭·오늘의 안내에서 함께 쓴다). */
export function OutfitCard({
  outfit,
  demo,
}: {
  outfit: Outfit;
  demo: boolean;
}) {
  const titleId = useId();
  return (
    <section className="weather-outfit-section" aria-labelledby={titleId}>
      <div className="weather-outfit-heading">
        <h2 id={titleId}>오늘의 옷차림</h2>
        <span className="pill">최고기온 {outfit.band}</span>
        {demo && <span className="pill">데모 기상 기준</span>}
      </div>
      <p className="weather-outfit-summary">{outfit.summary}</p>
      <dl className="weather-outfit-grid">
        {(
          [
            ['겉옷', outfit.outer],
            ['상의', outfit.top],
            ['하의', outfit.bottom],
            ['소품', outfit.accessories],
          ] as const
        ).map(([label, items]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{items.length > 0 ? items.join(', ') : '없어도 돼요'}</dd>
          </div>
        ))}
      </dl>
      {outfit.notes.length > 0 && (
        <div className="weather-outfit-extras">
          <h3>추가 준비물</h3>
          {outfit.extras.length > 0 && (
            <ul className="weather-outfit-chips">
              {outfit.extras.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <ul className="weather-outfit-notes">
            {outfit.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
