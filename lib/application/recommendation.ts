import { places } from '@/lib/domain/catalog';
import type { Recommendation } from '@/lib/domain/contracts';
import { ApplicationError } from '@/lib/domain/errors';
import {
  formatPlaceForReranker,
  scorePlaceMatch,
} from '@/lib/domain/place-labels';
import type { AIPort } from './ports';

const RERANK_CANDIDATE_LIMIT = 20;
const RELATED_LIMIT = 12;

export function createRecommendation(
  ai: Pick<AIPort, 'capabilities' | 'recommend'> &
    Partial<Pick<AIPort, 'rerank'>>,
) {
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
    const cityRanks = new Map<string, number>();
    const ranked = candidates
      .map((p) => {
        const cityRank = cityRanks.get(p.cityId) ?? 0;
        cityRanks.set(p.cityId, cityRank + 1);
        const matchScore = scorePlaceMatch(p, prompt);
        const feedbackScore = feedback
          .filter((f) => f.placeId === p.id)
          .reduce((n, f) => n + (f.rating - 3) * 10, 0);
        return {
          p,
          cityRank,
          score: matchScore + feedbackScore,
        };
      })
      .sort((a, b) => b.score - a.score || a.cityRank - b.cityRank);

    if (!capabilities().clova) {
      const top = ranked.slice(0, 3);
      return {
        mode: 'demo',
        reranked: false,
        title: `${prompt.trim().slice(0, 24)} 맞춤 경기 여행`,
        summary:
          '사전 라벨·키워드 일치도와 저장된 만족도를 바탕으로 연관 관광지를 골라 드렸어요. 원하는 장소를 자유롭게 담아 보세요.',
        stops: top.map(({ p }) => ({
          placeId: p.id,
          reason:
            `${p.region} · ${p.labels.setting} · ${p.labels.themes.slice(0, 2).join('/')} — ${p.description}`.slice(
              0,
              250,
            ),
        })),
        relatedPlaceIds: ranked.slice(0, RELATED_LIMIT).map(({ p }) => p.id),
      };
    }

    const rerankPool = ranked
      .slice(0, RERANK_CANDIDATE_LIMIT)
      .map(({ p }) => p);
    let citedIds: string[] = [];
    let reranked = false;

    if (ai.rerank && rerankPool.length > 1) {
      try {
        const rerankResult = await ai.rerank(
          prompt,
          rerankPool.map((p) => ({
            id: p.id,
            doc: formatPlaceForReranker(p),
          })),
        );
        const poolIds = new Set(rerankPool.map((p) => p.id));
        citedIds = rerankResult.citedIds.filter((id) => poolIds.has(id));
        reranked = citedIds.length > 0;
      } catch {
        // Reranker 일시 실패 시 1차 라벨·키워드 순위로 안전 폴백한다.
        citedIds = [];
        reranked = false;
      }
    }

    const citedSet = new Set(citedIds);
    const shortlist = reranked
      ? [
          ...citedIds.map((id) => rerankPool.find((p) => p.id === id)!),
          ...rerankPool.filter((p) => !citedSet.has(p.id)),
        ]
      : rerankPool;

    const result = await ai.recommend(prompt, shortlist, feedback);
    if (result.stops.some((s) => !shortlist.some((p) => p.id === s.placeId)))
      throw new ApplicationError(
        'UPSTREAM_INVALID',
        'AI가 유효한 여행 제안을 반환하지 않았습니다. 다시 시도해 주세요.',
      );

    const relatedPlaceIds = [
      ...new Set([
        ...result.stops.map((s) => s.placeId),
        ...citedIds,
        ...shortlist.map((p) => p.id),
      ]),
    ].slice(0, RELATED_LIMIT);

    return { ...result, mode: 'clova', relatedPlaceIds, reranked };
  }

  return recommend;
}
