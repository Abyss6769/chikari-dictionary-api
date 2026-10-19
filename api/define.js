export default async function handler(req, res) {
  // Allow chikari.moe to fetch this endpoint (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Cache response for 24 hours
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

  const { word } = req.query;

  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: "Missing 'word' parameter" });
  }

  const cleanWord = word.trim().toLowerCase();

  // Try Datamuse first (super fast, 100k free/day, never blocks cloud hosts)
  try {
    const dmRes = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(cleanWord)}&md=dp&max=1`);
    if (dmRes.ok) {
      const dmData = await dmRes.json();
      if (dmData.length > 0 && dmData[0].defs && dmData[0].defs.length > 0) {
        const rawDef = dmData[0].defs[0]; // e.g. "n\tA large creature"
        const parts = rawDef.split('\t');
        const posMap = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', u: 'unknown' };

        return res.status(200).json({
          word: cleanWord,
          phonetic: '',
          partOfSpeech: posMap[parts[0]] || parts[0] || '',
          definition: parts[1] || parts[0] || 'Definition found.',
          synonyms: []
        });
      }
    }
  } catch (e) {
    // Fall through to backup
  }

  // Backup fallback: Free Dictionary API
  try {
    const fallbackRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    if (fallbackRes.ok) {
      const data = await fallbackRes.json();
      const entry = data[0];
      const meaning = entry?.meanings?.[0];

      return res.status(200).json({
        word: entry.word,
        phonetic: entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '',
        partOfSpeech: meaning?.partOfSpeech || '',
        definition: meaning?.definitions?.[0]?.definition || 'No definition found.',
        synonyms: meaning?.synonyms?.slice(0, 5) || []
      });
    }
  } catch (e) {
    // Ignore and return not found below
  }

  return res.status(404).json({ error: "Word not found" });
}
