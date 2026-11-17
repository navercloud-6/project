import { places } from '@/lib/domain/catalog';
import type { Journey } from '@/lib/domain/contracts';
import { type History, demoEdit } from '@/lib/domain/assistant';
import { ApplicationError } from '@/lib/domain/errors';
import type { AIPort } from './ports';

export function createAssistant(ai: AIPort) {
  const { capabilities } = ai;
  function retrieve(question: string, placeId?: string) {
    const compact = question.replace(/\s/g, '');
    const chunks = [...new Set(compact.match(/.{2}/g) || [])];
    return places
      .map((p) => {
        const text = [p.name, p.description, p.region, ...p.tags].join('');
        const score =
          (p.id === placeId ? 100 : 0) +
          (compact.includes(p.name.replace(/\s/g, '')) ? 30 : 0) +
          chunks.filter((c) => text.includes(c)).length;
        return { p, score };
      })
      .filter((v) => v.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ p }) => p);
  }
  async function guide(
    question: string,
    placeId: string | undefined,
    history: History,
  ) {
    const found = retrieve(question, placeId);
    const sources = found.map((p) => ({
      id: p.id,
      title: p.name,
      text: `${p.description} 주소: ${p.address}`,
      url: p.sources[0].url,
      checkedOn: p.checkedOn,
      status: p.reviewStatus,
    }));
    const unknown =
      '현재 자료에서 운영시간·요금·예약·접근 가능 여부를 확인할 수 없습니다. 아래 공식 출처에서 최신 안내를 확인해 주세요.';
    if (!sources.length)
      return {
        answer:
          '이 질문에 답할 관광 근거를 찾지 못했습니다. 장소 이름을 함께 입력해 주세요.',
        sources: [],
        mode: 'retrieval',
      };
    if (
      /예약|요금|가격|운영|휴무|주차|휠체어|입장|몇\s*시|열려|닫|무료|유료/.test(
        question,
      )
    )
      return { answer: unknown, sources, mode: 'retrieval' };
    if (!capabilities().clova)
      return {
        answer: sources.map((s) => s.text).join('\n\n'),
        sources,
        mode: 'retrieval',
      };
    const result = await ai.guide(question, sources, history);
    if (result.sourceIds.some((id) => !sources.some((s) => s.id === id)))
      throw new ApplicationError(
        'UPSTREAM_INVALID',
        'AI가 유효한 출처를 반환하지 않았습니다.',
      );
    return {
      answer: result.answer,
      sources: sources.filter((s) => result.sourceIds.includes(s.id)),
      mode: 'clova',
    };
  }
  async function proposeEdit(
    journey: Journey,
    prompt: string,
    history: History,
  ) {
    if (!capabilities().clova)
      return { ...demoEdit(journey, prompt), mode: 'demo' };
    const proposal = await ai.proposeEdit(
      { name: journey.name, date: journey.date, placeIds: journey.placeIds },
      places,
      prompt,
      history,
    );
    return { ...proposal, mode: 'clova' };
  }

  return { guide, proposeEdit };
}
