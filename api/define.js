export default async function handler(req, res) {
  // Allow chikari.moe to fetch this endpoint (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Edge caching: Caches for 24 hours on Vercel's global CDN
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

  const { word } = req.query;

  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: "Missing 'word' parameter" });
  }

  try {
    const cleanWord = encodeURIComponent(word.trim().toLowerCase());
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanWord}`);

    if (!response.ok) {
      return res.status(404).json({ error: "Word not found" });
    }

    const data = await response.json();
    const entry = data[0];
    const meaning = entry.meanings?.[0];

    return res.status(200).json({
      word: entry.word,
      phonetic: entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '',
      partOfSpeech: meaning?.partOfSpeech || '',
      definition: meaning?.definitions?.[0]?.definition || 'No definition found.',
      synonyms: meaning?.synonyms?.slice(0, 5) || []
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
}
