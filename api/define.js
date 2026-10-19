export default async function handler(req, res) {
  // 1. Enable CORS for all domains
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // Handle browser pre-flight OPTIONS check
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { word } = req.query;

  if (!word || typeof word !== "string") {
    return res.status(400).json({ error: "Word parameter is required." });
  }

  const cleanWord = word.trim().toLowerCase();

  try {
    let definition = "";
    let partOfSpeech = "";
    let phonetic = "";
    let synonyms = [];

    // --- Strategy 1: Datamuse API (Fast, resilient, high limits) ---
    try {
      const datamuseRes = await fetch(
        `https://api.datamuse.com/words?sp=${encodeURIComponent(cleanWord)}&md=dp&max=1`
      );
      if (datamuseRes.ok) {
        const data = await datamuseRes.json();
        if (data && data.length > 0 && data[0].defs && data[0].defs.length > 0) {
          const rawDef = data[0].defs[0]; // Format: "n\tdefinition text"
          const tabIndex = rawDef.indexOf("\t");

          if (tabIndex !== -1) {
            const posTag = rawDef.substring(0, tabIndex).trim();
            definition = rawDef.substring(tabIndex + 1).trim();

            const posMap = {
              n: "noun",
              v: "verb",
              adj: "adjective",
              adv: "adverb",
              u: "unknown"
            };
            partOfSpeech = posMap[posTag] || posTag;
          } else {
            definition = rawDef;
          }
        }
      }

      // Fetch synonyms from Datamuse
      const synRes = await fetch(
        `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(cleanWord)}&max=5`
      );
      if (synRes.ok) {
        const synData = await synRes.json();
        if (Array.isArray(synData)) {
          synonyms = synData.map((s) => s.word);
        }
      }
    } catch (e) {
      // Continue to fallback if Datamuse encounters an issue
    }

    // --- Strategy 2: Fallback to Free Dictionary API ---
    if (!definition) {
      try {
        const dictRes = await fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`
        );
        if (dictRes.ok) {
          const dictData = await dictRes.json();
          if (Array.isArray(dictData) && dictData.length > 0) {
            const entry = dictData[0];
            phonetic = entry.phonetic || (entry.phonetics && entry.phonetics[0]?.text) || "";

            if (entry.meanings && entry.meanings.length > 0) {
              const firstMeaning = entry.meanings[0];
              partOfSpeech = firstMeaning.partOfSpeech || "";

              if (firstMeaning.definitions && firstMeaning.definitions.length > 0) {
                definition = firstMeaning.definitions[0].definition || "";
              }

              if (firstMeaning.synonyms && firstMeaning.synonyms.length > 0) {
                synonyms = [...new Set([...synonyms, ...firstMeaning.synonyms])].slice(0, 5);
              }
            }
          }
        }
      } catch (e) {
        // Fallback failed
      }
    }

    // Return 404 if no definition was found across both sources
    if (!definition) {
      return res.status(404).json({ error: `Definition for '${word}' not found.` });
    }

    // Format the word with part of speech in parentheses
    const displayWord = partOfSpeech ? `${word} (${partOfSpeech})` : word;

    // Set Edge CDN caching header (24 hours)
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");

    return res.status(200).json({
      word: displayWord,
      phonetic: phonetic,
      partOfSpeech: partOfSpeech,
      definition: definition,
      synonyms: synonyms
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error occurred." });
  }
}
