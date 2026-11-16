import assert from 'node:assert/strict';
import test from 'node:test';

import { checkStatement, normalise, pageText, quoteIn, verifyStatements } from '../../supabase/functions/_shared/statements.ts';

const people = new Map([
  ['elon-musk', 'Elon Musk'],
  ['charles-koch', 'Charles Koch & family'],
]);
const same = (u: string) => u.replace(/\/$/, '');
const cited = new Set(['https://example.com/a', 'https://x.com/elonmusk/status/123']);

test('a quote counts only word for word and near the speaker’s name', () => {
  const page = pageText('<p>Asked about tariffs, Musk said: &ldquo;Tariffs are a tax on consumers, plain and simple.&rdquo;</p><script>var x="Tariffs are a tax"</script>');
  assert.equal(quoteIn('Tariffs are a tax on consumers, plain and simple', page, 'Musk'), true);
  assert.equal(quoteIn('Tariffs are a tax on everyone, plain and simple', page, 'Musk'), false); // altered
  assert.equal(quoteIn('Tariffs are a tax on consumers, plain and simple', page, 'Koch'), false); // someone else's words
  assert.equal(quoteIn('a tax', page, 'Musk'), false); // too short to identify
  assert.equal(normalise('It’s “done” — now.'), "it's done now");
});

test('statements must name a tracked person, be short and come from this search', () => {
  const ok = { person: 'elon-musk', quote: '“We will build it in Texas.”', said: '2026-05-01', url: 'https://example.com/a/' };
  const c = checkStatement(ok, people, cited, same);
  assert.equal(typeof c, 'object');
  assert.equal((c as { quote: string }).quote, 'We will build it in Texas.');
  assert.equal((c as { label: string }).label, 'example.com');
  assert.equal(checkStatement({ ...ok, person: 'someone' }, people, cited, same), 'not a tracked person');
  assert.equal(checkStatement({ ...ok, url: 'https://other.com/b' }, people, cited, same), 'source not from this search');
  assert.equal(checkStatement({ ...ok, quote: Array(50).fill('word').join(' ') }, people, cited, same), 'quote missing or too long');
  assert.equal((checkStatement({ ...ok, said: 'last May' }, people, cited, same) as { said: string | null }).said, null);
});

test('only statements found on their page are kept, one per person', async () => {
  const pages: Record<string, string> = {
    'https://example.com/a': 'Koch wrote that free trade lifts everyone in the long run, in a letter.',
    'https://x.com/elonmusk/status/123': 'We will build it in Texas, says Musk',
  };
  const { kept, dropped } = await verifyStatements(
    [
      { person: 'charles-koch', quote: 'free trade lifts everyone in the long run', said: '', url: 'https://example.com/a' },
      { person: 'elon-musk', quote: 'We will build it in Ohio', said: '', url: 'https://x.com/elonmusk/status/123' },
      { person: 'elon-musk', quote: 'We will build it in Texas', said: '', url: 'https://x.com/elonmusk/status/123' },
      { person: 'charles-koch', quote: 'free trade lifts everyone in the long run', said: '', url: 'https://example.com/a' },
    ],
    people,
    cited,
    same,
    async (u) => pages[u] ?? null,
  );
  assert.deepEqual(kept.map((k) => k.person), ['charles-koch', 'elon-musk']);
  assert.equal(dropped[0], 'quote not on the page (x.com)');
});
