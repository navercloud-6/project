import { places } from '@/lib/domain/catalog';
import type { Recommendation } from '@/lib/domain/contracts';
import { ApplicationError } from '@/lib/domain/errors';
import type { AIPort } from './ports';

export function createRecommendation(ai: AIPort) {
  const { capabilities } = ai;
  async function recommend(
    prompt: string,
    region: string,
    feedback: { placeId: string; rating: number }[],
  ): Promise<Recommendation> {
    const candidates = places.filter(
      (p) => region === '전체' || p.region === region,
    );
    if (!candidates.length)
      throw new ApplicationError(
        'INVALID_INPUT',
        '선택한 지역의 장소가 없습니다.',
      );
    if (!capabilities().clova) {
      const words = prompt.split(/\s+/).filter((w) => w.length > 1);
      const ranked = candidates
        .map((p) => ({
          p,
          score:
            words.reduce(
              (n, w) =>
                n +
                (JSON.stringify([p.name, p.description, p.tags]).includes(w)
                  ? 2
                  : 0),
              0,
            ) +
            feedback
              .filter((f) => f.placeId === p.id)
              .reduce((n, f) => n + f.rating - 3, 0),
        }))
        .sort((a, b) => b.score - a.score);
      return {
        mode: 'demo',
        title: '시흥에서 보내는 하루',
        summary:
          '입력 키워드와 저장된 만족도를 참고한 데모 제안입니다. 장소를 자유롭게 바꿔 나만의 여행을 만들어 보세요.',
        stops: ranked.slice(0, 3).map(({ p }) => ({
          placeId: p.id,
          reason: `${p.region}에서 만나는 ${p.tags[0] || '여행'} 장소. ${p.description}`,
        })),
      };
    }
    const result = await ai.recommend(prompt, candidates, feedback);
    if (result.stops.some((s) => !candidates.some((p) => p.id === s.placeId)))
      throw new ApplicationError(
        'UPSTREAM_INVALID',
        'AI가 유효한 여행 제안을 반환하지 않았습니다. 다시 시도해 주세요.',
      );
    return { ...result, mode: 'clova' };
  }

  return recommend;
}
