'use client';
import { useState } from 'react';
import type { Place } from '@/lib/domain/catalog';
import {
  assistant,
  ErrorText,
  type Capabilities,
  type History,
} from './shared';
export function Guide({
  places,
  capabilities,
  onDetail,
  onBrowse,
}: {
  places: Place[];
  capabilities: Capabilities;
  onDetail: (place: Place) => void;
  onBrowse?: () => void;
}) {
  const [placeId, setPlace] = useState('');
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<History>([]);
  const [answer, setAnswer] = useState<{
    answer: string;
    mode: string;
    sources: { id: string; title: string; url: string; checkedOn: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function ask() {
    setBusy(true);
    setError('');
    try {
      const data = await (
        await assistant({
          action: 'guide',
          question,
          placeId: placeId || undefined,
          history,
        })
      ).json();
      setAnswer(data);
      setHistory(
        [
          ...history,
          { role: 'user', content: question },
          { role: 'assistant', content: data.answer },
        ].slice(-6) as History,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tool-section">
      <span className="pill">근거 있는 관광 안내</span>
      <h2>궁금한 경기, 출처와 함께</h2>
      <p className="fine">
        {capabilities.clova
          ? '검색한 관광 자료를 바탕으로 AI가 답합니다.'
          : '현재는 AI 답변 대신 관광 자료 검색 결과를 보여드립니다.'}{' '}
        현재 자료는 검토 전이며 운영·요금·예약은 확인할 수 없습니다.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label htmlFor="guide-place">궁금한 장소</label>
        <select
          id="guide-place"
          value={placeId}
          onChange={(e) => {
            setPlace(e.target.value);
            setHistory([]);
            setAnswer(null);
          }}
        >
          <option value="">전체에서 검색</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label htmlFor="guide-question">질문</label>
        <input
          id="guide-question"
          required
          minLength={2}
          maxLength={500}
          placeholder="오이도박물관에서는 무엇을 볼 수 있나요?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="suggestions">
          {[
            '갯골생태공원 산책 코스',
            '오이도박물관 볼거리',
            '배곧한울공원 일몰',
          ].map((text) => (
            <button type="button" key={text} onClick={() => setQuestion(text)}>
              {text}
            </button>
          ))}
        </div>
        <button className="primary" disabled={busy}>
          {busy ? '근거를 찾고 있어요…' : '관광 안내 받기'}
        </button>
      </form>
      <ErrorText text={error} />
      {answer && (
        <div className="tool-result" aria-live="polite">
          <span className="pill">
            {answer.mode === 'clova' ? 'AI 답변' : '자료 검색 결과'}
          </span>
          <p>{answer.answer}</p>
          {answer.sources.length > 0 ? (
            <ul>
              {answer.sources.map((s) => {
                const matched = places.find((p) => p.id === s.id);
                return (
                  <li key={s.id}>
                    <div className="source-actions">
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title} 공식 출처 ↗
                      </a>
                      {matched && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => onDetail(matched)}
                        >
                          장소 상세
                        </button>
                      )}
                    </div>
                    <small>
                      자료 확인: {s.checkedOn} · 검토 전 · 현재 운영 확인일 아님
                    </small>
                  </li>
                );
              })}
            </ul>
          ) : (
            onBrowse && (
              <div className="tool-actions">
                <button type="button" className="secondary" onClick={onBrowse}>
                  전체 장소 둘러보기
                </button>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
