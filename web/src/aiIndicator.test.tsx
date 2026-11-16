import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiIndicatorView, aiIndicatorText, type AiStatus } from './components/AiIndicator';
const base: AiStatus = { enabled: true, running: false, done: 0, total: 0 };
it('distinguishes photo batches, interactive jobs, idle, off and unavailable status', () => {
 expect(aiIndicatorText(null)).toBe('AI status unavailable');
 expect(aiIndicatorText({...base,enabled:false})).toBe('AI is off');
 expect(aiIndicatorText(base)).toBe('AI is idle');
 expect(aiIndicatorText({...base,running:true,batchRunning:true})).toBe('AI is analysing photos');
 expect(aiIndicatorText({...base,running:true,jobs:['describe']})).toBe('AI is analysing photos');
 expect(aiIndicatorText({...base,running:true,jobs:['search']})).toBe('AI is searching');
 expect(aiIndicatorText({...base,running:true,jobs:['ideas']})).toBe('AI is finding composition ideas');
});
it('keeps the status slot visible and accessible while only active work pulses', () => {
 for (const status of [null,base,{...base,running:true}]) {
  const html=renderToStaticMarkup(<AiIndicatorView status={status} />);
  expect(html).toContain('class="ai-indicator"');
  expect(html).toContain(`aria-label="${aiIndicatorText(status)}"`);
  expect(html.includes(' working')).toBe(!!status?.running);
 }
});
