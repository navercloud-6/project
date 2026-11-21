import { z } from 'zod';
import { placeById } from '@/lib/domain/catalog';
import { assistantInput } from '@/lib/domain/assistant';
import { ApplicationError } from '@/lib/domain/errors';
import { revisionOf } from '@/lib/domain/journey';
import type { JourneyService } from './journeys';
import type { AIPort, LimitPort, JourneyDraft } from './ports';
import { createAssistant } from './assistant';
import { createCache } from './cache';
import { createRecommendation } from './recommendation';
import type { BriefingService } from './briefing';

const PLACE_CACHE_MS = 24 * 60 * 60 * 1000;
const PLACE_TRANSLATE_CACHE_MAX = 500;
const PLACE_VOICE_CACHE_MAX = 100;

export function createOperations(
  journeys: JourneyService,
  ai: AIPort,
  limits: LimitPort,
  briefing?: BriefingService,
  now: () => number = () => 0,
) {
  const { getJourney, applyEdit, photoFor } = journeys;
  const { guide, proposeEdit } = createAssistant(ai);
  const recommend = createRecommendation(ai, now);
  // 정적 카탈로그 문구 기반 장소 번역·음성은 모든 사용자에게 동일하므로 서버에서 캐시·병합한다.
  const placeTranslations = createCache<string>({
    now,
    ttlMs: PLACE_CACHE_MS,
    maxEntries: PLACE_TRANSLATE_CACHE_MAX,
  });
  const placeVoices = createCache<Uint8Array>({
    now,
    ttlMs: PLACE_CACHE_MS,
    maxEntries: PLACE_VOICE_CACHE_MAX,
  });

  async function limit(
    key: string,
    maximum: number,
    message: string,
    globalMaximum?: number,
  ) {
    if (
      !(await limits.consume(key, maximum)) ||
      (globalMaximum !== undefined &&
        !(await limits.consume(key.split(':')[0] + ':global', globalMaximum)))
    )
      throw new ApplicationError('RATE_LIMIT', message);
  }
  const chargeAssistant = (owner: string) =>
    limit(
      'assistant:' + owner,
      30,
      '도우미의 시간당 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
      150,
    );

  async function save(owner: string, input: JourneyDraft) {
    await limit(
      'save:' + owner,
      30,
      '저장 요청이 많습니다. 한 시간 후 다시 시도해 주세요.',
    );
    return journeys.saveJourney(owner, input);
  }
  async function recommendation(
    owner: string,
    input: { prompt: string; region: string },
  ) {
    const feedback = (await journeys.journeys(owner))
      .slice(0, 10)
      .flatMap((j) =>
        Object.entries(j.records).map(([placeId, r]) => ({
          placeId,
          rating: r.rating,
        })),
      );
    // 이미 캐시됐거나 생성 중인 일반 질의 추천은 외부 호출이 없으므로 한도를 차감하지 않는다.
    if (!recommend.hasCached(input.prompt, input.region, feedback))
      await limit(
        'ai:' + owner,
        10,
        '시간당 추천 한도에 도달했습니다. 직접 장소를 담거나 한 시간 후 다시 시도해 주세요.',
        100,
      );
    return recommend(input.prompt, input.region, feedback);
  }
  async function assistant(
    owner: string,
    data: z.infer<typeof assistantInput>,
  ) {
    switch (data.action) {
      case 'briefing':
      case 'briefingVoice': {
        if (!briefing)
          throw new ApplicationError(
            'UNAVAILABLE',
            '통합 안내가 설정되지 않았습니다.',
          );
        const isText = data.action === 'briefing';
        if (
          !(isText ? briefing.hasText : briefing.hasAudio)(
            data.region,
            data.lang,
          )
        )
          await chargeAssistant(owner);
        return (isText ? briefing.text : briefing.audio)(
          data.region,
          data.lang,
        );
      }
      case 'translate': {
        if (data.placeId) {
          const key = `${data.placeId}:${data.target}`;
          if (!placeTranslations.has(key)) await chargeAssistant(owner);
          return {
            text: await placeTranslations.getOrLoad(key, () =>
              ai.translate(placeText(data.placeId!), data.target),
            ),
            mode: 'papago',
          };
        }
        await chargeAssistant(owner);
        const text = await journeyText(owner, data.journeyId!);
        return { text: await ai.translate(text, data.target), mode: 'papago' };
      }
      case 'voice': {
        if (!placeVoices.has(data.placeId)) await chargeAssistant(owner);
        return placeVoices.getOrLoad(data.placeId, () =>
          ai.voice(placeText(data.placeId)),
        );
      }
      case 'guide':
        await chargeAssistant(owner);
        return guide(data.question, data.placeId, data.history);
      case 'edit': {
        await chargeAssistant(owner);
        const journey = await getJourney(owner, data.journeyId);
        return {
          proposal: await proposeEdit(journey, data.prompt, data.history),
          revision: revisionOf(journey),
        };
      }
      case 'apply':
        await chargeAssistant(owner);
        return {
          journey: await applyEdit(owner, data.journeyId, data.revision, {
            name: data.proposal.name,
            date: data.proposal.date,
            placeIds: data.proposal.placeIds,
          }),
        };
      case 'diary': {
        await chargeAssistant(owner);
        const photo = await photoFor(owner, data.journeyId, data.placeId);
        if (!photo)
          throw new ApplicationError(
            'NOT_FOUND',
            '먼저 이 장소의 사진을 저장해 주세요.',
          );
        return ai.diary(placeById.get(data.placeId)!.name, photo.image);
      }
    }
  }
  function placeText(id: string) {
    const p = placeById.get(id)!;
    return `${p.name}. ${p.description} 주소: ${p.address}. 검토 전 관광 자료이며 현재 운영시간과 요금은 공식 안내에서 확인해 주세요.`;
  }
  async function journeyText(owner: string, id: string) {
    const j = await getJourney(owner, id);
    return `${j.name}\n${j.date}\n${j.placeIds.map((id, i) => `${i + 1}. ${placeText(id)}`).join('\n')}\n여행 계획용 시연 패스입니다.`;
  }

  async function uploadPhoto(
    owner: string,
    journey: string,
    place: string,
    loadImage: () => Promise<Uint8Array>,
  ) {
    const current = await getJourney(owner, journey);
    if (!current.placeIds.includes(place))
      throw new ApplicationError(
        'INVALID_INPUT',
        '여행에 포함된 장소가 아닙니다.',
      );
    await limit('photo:' + owner, 20, '사진 저장 한도에 도달했습니다.', 100);
    return journeys.savePhoto(owner, journey, place, await loadImage());
  }

  async function poster(owner: string, loadImage: () => Promise<Uint8Array>) {
    await limit('poster:' + owner, 10, '포스터 인식 한도에 도달했습니다.', 50);
    const text = await ai.ocr(await loadImage());
    if (!ai.capabilities().clova)
      return {
        text,
        draft: { title: '', date: '', location: '' },
        mode: 'ocr',
        message:
          '텍스트를 추출했습니다. 아래 원문을 참고해 일정 항목을 직접 입력해 주세요.',
      };
    return {
      text,
      draft: await ai.poster(text),
      mode: 'ocr-clova',
      message:
        '인식 결과를 원본 포스터와 비교하고 행사 날짜·장소를 확인해 주세요.',
    };
  }
  return { save, recommendation, assistant, uploadPhoto, poster };
}
